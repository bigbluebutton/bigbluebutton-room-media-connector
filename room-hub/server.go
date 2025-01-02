package main

import (
	"crypto/rand"
	"encoding/json"
	"flag"
	"github.com/go-playground/validator/v10"
	"github.com/gorilla/websocket"
	"log"
	"math/big"
	"net/http"
	"strconv"
)

var validate *validator.Validate

// Upgrader to upgrade HTTP connections to WebSocket
var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin:     func(r *http.Request) bool { return true },
}

// Initialize ConnectionManager instance
var connManager = &ConnectionManager{
	rooms:     make(map[string]*Room),
	plugins:   make(map[string]*Plugin),
	pinToRoom: make(map[string]string),
}

// generate a random string of given length from a given character set
const Digits string = "0123456789"
const ASCIILettersUppercase string = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"

func randomString(length int, characterSet string) (string, error) {
	var generatedString = ""
	for j := 0; j < length; j++ {
		n, err := rand.Int(rand.Reader, big.NewInt(int64(len(characterSet))))
		if err != nil {
			log.Printf("failed to generate random string: %s", err)
			return "", err
		}
		generatedString += string(characterSet[n.Int64()])
	}
	return generatedString, nil
}

func roomHandler(w http.ResponseWriter, r *http.Request) {
	roomConn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Println("upgrade error:", err)
		return
	}

	// Create a new room
	room := newRoom(roomConn)
	connManager.addRoom(room)

	// Handle incoming messages from the room
	for {
		_, msg, err := roomConn.ReadMessage()
		if err != nil {
			log.Println("read error:", err)

			room.disconnect()

			return
		}

		// Check if message can be parsed into the base format all messages use
		var baseMessage BaseMessage
		err = json.Unmarshal(msg, &baseMessage)
		if err != nil {
			log.Printf("Error parsing message: %s", msg)
			continue
		}
		err = validate.Struct(baseMessage)
		if err != nil {
			log.Printf("Message format invalid: %s", err)
			continue
		}

		// Ignore ping messages
		if baseMessage.Type == MessageTypePing {
			continue
		}

		// Depending on the state of the room only handle messages with the correct type
		switch room.State {

		// Room connected to the websocket channel but not ready yet
		case "new":

			if baseMessage.Type != MessageTypeRegisterRoom {
				log.Printf("Protocol violation: Room must register itself first")
				continue
			}

			// Try to cast the message to a RegisterRoomMessage
			var registerRoomMessage RegisterRoomMessage
			err = json.Unmarshal(msg, &registerRoomMessage)
			if err != nil {
				log.Printf("Error unmarshalling to RegisterRoomMessage: %s", err)
				continue
			}

			err = validate.Struct(registerRoomMessage)
			if err != nil {
				log.Printf("Error validating RegisterRoomMessage: %s", err)
				continue
			}

			log.Println("RoomConfig:", registerRoomMessage.RoomConfig)
			room.register(registerRoomMessage.RoomConfig)

			break
		case "ready":
			// Room is waiting for a plugin to connect
			// do nothing
			break
		case "verifying":
			// Plugin connected with pin
			// waiting for room to verify the connection

			if baseMessage.Type != MessageTypeVerificationCodeResponse {
				log.Printf("Protocol violation: Room must respond to verification")
				continue
			}

			// Try to cast the message to a RegisterRoomMessage
			var verificationCodeResponseMessage VerificationCodeResponseMessage
			err = json.Unmarshal(msg, &verificationCodeResponseMessage)
			if err != nil {
				log.Printf("Error unmarshalling to VerificationCodeResponseMessage: %s", err)
				continue
			}

			err = validate.Struct(verificationCodeResponseMessage)
			if err != nil {
				log.Printf("Error validating VerificationCodeResponseMessage: %s", err)
				continue
			}

			if verificationCodeResponseMessage.Status {
				room.acceptConnection()
			} else {
				room.rejectConnection()
			}

			break

		case "connected":
			// Room is connected to a plugin

			// Forward messages to the plugin
			plugin := room.getPlugin()
			plugin.sendMessage(msg)

			break
		}
	}
}

func pluginHandler(w http.ResponseWriter, r *http.Request) {
	// pluginHandler to handle WebSocket connections from plugins
	// handle RoomPINMessage and PairingPINMessage

	pluginConn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Println("upgrade error:", err)
		return
	}

	// Create a new plugin
	plugin := newPlugin(pluginConn)
	connManager.addPlugin(plugin)

	for {
		_, msg, err := pluginConn.ReadMessage()
		if err != nil {
			log.Println("read error:", err)
			plugin.disconnect()
			return
		}

		// Check if message can be parsed into the base format all messages use
		var baseMessage BaseMessage
		err = json.Unmarshal(msg, &baseMessage)
		if err != nil {
			log.Printf("Error parsing message: %s", msg)
			continue
		}
		err = validate.Struct(baseMessage)
		if err != nil {
			log.Printf("Message format invalid: %s", err)
			continue
		}

		// Ignore ping messages
		if baseMessage.Type == MessageTypePing {
			continue
		}

		// Depending on the state of the plugin only handle messages with the correct type

		// Find room plugin is connected to
		room := plugin.getRoom()

		// If not connected to a room
		if room == nil {

			// Only listen to PairingPINUserInputMessage ignore all else
			if baseMessage.Type != MessageTypePairingPINUserInput {
				log.Printf("Protocol violation: Plugin must connect to a room first")
				continue
			}

			// Try to cast the message to a PairingPINUserInputMessage
			var pairingPINUserInputMessage PairingPINUserInputMessage
			err = json.Unmarshal(msg, &pairingPINUserInputMessage)
			if err != nil {
				log.Printf("Error unmarshalling to PairingPINUserInputMessage: %s", err)
				continue
			}

			err = validate.Struct(pairingPINUserInputMessage)
			if err != nil {
				log.Printf("Error validating PairingPINUserInputMessage: %s", err)
				continue
			}

			// Try to pair with a room
			room := plugin.pairWithRoom(pairingPINUserInputMessage.PIN)

			// If room was not found, wait for next attempt
			if room == nil {
				continue
			}

		} else {
			// Connected to a room

			switch room.State {

			// Room is verified
			case "verified":
				// Only listen to JoinURLsMessage ignore all else
				if baseMessage.Type != MessageTypeJoinURLs {
					log.Printf("Protocol violation: Plugin must send join URLs")
					continue
				}

				// Try to cast the message to a JoinURLsMessage
				var joinURLsMessage JoinURLsMessage
				err = json.Unmarshal(msg, &joinURLsMessage)
				if err != nil {
					log.Printf("Error unmarshalling to JoinURLsMessage: %s", err)
					continue
				}

				err = validate.Struct(joinURLsMessage)
				if err != nil {
					log.Printf("Error validating JoinURLsMessage: %s", err)
					continue
				}

				room.connect(joinURLsMessage.JoinURLs)

				break
			case "connected":
				// Room is connected to a plugin

				// Forward messages to the room
				room.sendMessage(msg)

				break
			}

		}
	}
}

func main() {
	host := flag.String("host", "127.0.0.1", "websocket server host")
	port := flag.Int("port", 8080, "websocket server port")
	flag.Parse()

	validate = validator.New()

	http.HandleFunc("/ws_room", roomHandler)
	http.HandleFunc("/ws_plugin", pluginHandler)

	log.Printf("WebSocket server started on %s:%d", *host, *port)
	err := http.ListenAndServe(*host+":"+strconv.Itoa(*port), nil)
	if err != nil {
		log.Fatal("ListenAndServe: ", err)
	}
}
