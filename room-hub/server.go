package main

import (
	"crypto/rand"
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

type Client interface {
	sendMessage(message any) bool
	disconnect()
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

func sendInvalidMessage(client Client) bool {
	invalidMessage := InvalidMessage{
		Type: MessageTypeInvalid,
	}

	return client.sendMessage(invalidMessage)
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

		message, err := parseMessage(msg)

		if err != nil {
			sendInvalidMessage(room)
			continue
		}

		// Ignore ping messages
		if message.Type == MessageTypePing {
			continue
		}

		// Depending on the state of the room only handle messages with the correct type
		switch room.State {

		// Room connected to the websocket channel but not ready yet
		case "new":

			registerRoomMessage, err := unmarshalMessage[RegisterRoomMessage](message, MessageTypeRegisterRoom)
			if err != nil {
				sendInvalidMessage(room)
				continue
			}

			log.Println("RoomConfig:", registerRoomMessage.RoomConfig)
			room.register(registerRoomMessage.RoomConfig)

			break
		case "ready":
			// Room is waiting for a plugin to connect
			// do nothing
			log.Printf("Protocol violation: Room must register itself first")
			sendInvalidMessage(room)
			break
		case "verifying":
			// Plugin connected with pin
			// waiting for room to verify the connection

			verificationCodeResponseMessage, err := unmarshalMessage[VerificationCodeResponseMessage](message, MessageTypeVerificationCodeResponse)
			if err != nil {
				sendInvalidMessage(room)
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

			dataMessage, err := unmarshalMessage[DataMessage](message, MessageTypeData)
			if err != nil {
				sendInvalidMessage(room)
				continue
			}

			// Forward messages to the plugin
			plugin := room.getPlugin()
			plugin.sendMessage(dataMessage)

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

		message, err := parseMessage(msg)

		if err != nil {
			sendInvalidMessage(plugin)
			continue
		}

		// Ignore ping messages
		if message.Type == MessageTypePing {
			continue
		}

		// Depending on the state of the plugin only handle messages with the correct type

		// Find room plugin is connected to
		room := plugin.getRoom()

		// If not connected to a room
		if room == nil {

			pairingPINUserInputMessage, err := unmarshalMessage[PairingPINUserInputMessage](message, MessageTypePairingPINUserInput)
			if err != nil {
				sendInvalidMessage(room)
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

				joinURLsMessage, err := unmarshalMessage[JoinURLsMessage](message, MessageTypeJoinURLs)
				if err != nil {
					sendInvalidMessage(room)
					continue
				}

				room.connect(joinURLsMessage.JoinURLs)

				break
			case "connected":
				// Room is connected to a plugin

				dataMessage, err := unmarshalMessage[DataMessage](message, MessageTypeData)
				if err != nil {
					sendInvalidMessage(room)
					continue
				}

				// Forward messages to the room
				room.sendMessage(dataMessage)

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
