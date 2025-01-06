package main

import (
	"crypto/rand"
	"flag"
	"github.com/go-playground/validator/v10"
	"github.com/gorilla/websocket"
	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"
	"math/big"
	"net/http"
	"os"
	"strconv"
	"time"
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
	close()
}

// Digits Constant with all digits used for randomString generation
const Digits string = "0123456789"

// ASCIILettersUppercase Constant with all uppercase ASCII letters used for randomString generation
const ASCIILettersUppercase string = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"

// randomString generates a random string of the given length from the specified character set.
// It returns the generated string and an error if the random number generation fails.
func randomString(length int, characterSet string) (string, error) {
	var generatedString = ""
	for j := 0; j < length; j++ {
		n, err := rand.Int(rand.Reader, big.NewInt(int64(len(characterSet))))
		if err != nil {
			return "", err
		}
		generatedString += string(characterSet[n.Int64()])
	}
	return generatedString, nil
}

// sendInvalidMessage sends an InvalidMessage to the specified client.
// It returns true if the message was sent successfully, otherwise false.
func sendInvalidMessage(client Client) bool {
	invalidMessage := InvalidMessage{
		Type: MessageTypeInvalid,
	}

	return client.sendMessage(invalidMessage)
}

func sendPongMessage(client Client) {
	pongMessage := PongMessage{
		Type: MessageTypePong,
	}

	if !client.sendMessage(pongMessage) {
		client.disconnect()
	}
	return
}

// roomHandler handles WebSocket connections from rooms.
// It upgrades the HTTP connection to a WebSocket connection and processes incoming messages from the room.
func roomHandler(w http.ResponseWriter, r *http.Request, timeout int) {
	// try to upgrade the HTTP connection to a WebSocket connection
	roomConn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Error().
			Err(err).
			Msg("Failed to upgrade connection to websocket")
		return
	}

	// Create a new room
	room := newRoom(roomConn)
	connManager.addRoom(room)

	// Handle incoming messages from the room
	for {
		roomConn.SetReadDeadline(time.Now().Add(time.Duration(timeout) * time.Second))
		_, msg, err := roomConn.ReadMessage()
		if err != nil {
			log.Error().
				Str("room_id", room.Id).
				Err(err).
				Msg("Websocket read error")
			room.close()
			return
		}

		// Parse the incoming message
		message, err := parseMessage(msg)

		// If the message could not be parsed, send an InvalidMessage to the room
		if err != nil {
			sendInvalidMessage(room)
			continue
		}

		// Ignore ping messages
		if message.Type == MessageTypePing {
			sendPongMessage(room)
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

			room.register(registerRoomMessage.RoomConfig)

			break
		case "ready":
			// Room is waiting for a plugin to connect
			// do nothing
			log.Warn().Str("type", string(message.Type)).Msg("Protocol violation")
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

			if message.Type == MessageTypeDisconnect {
				room.disconnect()
				continue
			}

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

// pluginHandler handles WebSocket connections from plugins.
// It upgrades the HTTP connection to a WebSocket connection and processes incoming messages from the plugin.
func pluginHandler(w http.ResponseWriter, r *http.Request, timeout int) {
	// pluginHandler to handle WebSocket connections from plugins
	// handle RoomPINMessage and PairingPINMessage

	pluginConn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Warn().Err(err).Msg("upgrade error")
		return
	}

	// Create a new plugin
	plugin := newPlugin(pluginConn)
	connManager.addPlugin(plugin)

	for {
		pluginConn.SetReadDeadline(time.Now().Add(time.Duration(timeout) * time.Second))
		_, msg, err := pluginConn.ReadMessage()
		if err != nil {
			log.Error().
				Str("plugin_id", plugin.Id).
				Err(err).
				Msg("Read error")
			plugin.close()
			return
		}

		message, err := parseMessage(msg)

		if err != nil {
			sendInvalidMessage(plugin)
			continue
		}

		// Ignore ping messages
		if message.Type == MessageTypePing {
			sendPongMessage(plugin)
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

				if message.Type == MessageTypeDisconnect {
					plugin.disconnect()
					continue
				}

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

// main is the entry point of the application.
// It starts the WebSocket server and listens for incoming connections on the specified host and port.
func main() {
	// UNIX Time is faster and smaller than most timestamps
	zerolog.TimeFieldFormat = zerolog.TimeFormatUnix

	// Parse command line arguments for host and port
	host := flag.String("host", "127.0.0.1", "websocket server host")
	port := flag.Int("port", 8080, "websocket server port")
	timeout := flag.Int("timeout", 60, "read timeout in seconds")
	jsonLog := flag.Bool("json_log", true, "log in json format")
	flag.Parse()

	validate = validator.New()

	if !*jsonLog {
		log.Logger = log.Output(zerolog.ConsoleWriter{Out: os.Stderr, TimeFormat: time.TimeOnly})
	}

	http.HandleFunc("/ws_room", func(writer http.ResponseWriter, request *http.Request) {
		roomHandler(writer, request, *timeout)
	})
	http.HandleFunc("/ws_plugin", func(writer http.ResponseWriter, request *http.Request) {
		pluginHandler(writer, request, *timeout)
	})

	log.Info().Msg("Server started, listening on " + *host + ":" + strconv.Itoa(*port) + ", read timeout: " + strconv.Itoa(*timeout))
	err := http.ListenAndServe(*host+":"+strconv.Itoa(*port), nil)
	if err != nil {
		log.Fatal().Err(err).Msg("Failed to start server")
	}
}
