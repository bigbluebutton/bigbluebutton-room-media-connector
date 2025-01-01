package main

import (
	"context"
	"crypto/rand"
	"encoding/json"
	"errors"
	"log"
	"math/big"
	"net/http"
	"os"
	"sync"
	"time"

	"github.com/go-playground/validator/v10"

	"github.com/google/uuid"
	"github.com/gorilla/websocket"
)

const pinRotationInterval = 10 // Interval in seconds

var validate *validator.Validate

const Digits string = "0123456789"
const ASCIILettersUppercase string = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"

// generate a random string of given length from a given character set
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

// Upgrader to upgrade HTTP connections to WebSocket
var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin:     func(r *http.Request) bool { return true },
}

// Struct to hold connection pairs and mutex for thread safety
type ConnectionManager struct {
	sync.Mutex
	rooms     map[string]*Room
	plugins   map[string]*Plugin
	pinToRoom map[string]string // Used to look up roomID via room PIN
}

// Struct to store room connection and configuration
type Room struct {
	Id         string
	Conn       *websocket.Conn
	PluginID   string
	Config     RoomConfig
	State      string
	StopPinGen context.CancelFunc
}

type Plugin struct {
	Id     string
	RoomID string
	Conn   *websocket.Conn
}

// Initialize ConnectionManager instance
var connManager = &ConnectionManager{
	rooms:     make(map[string]*Room),
	plugins:   make(map[string]*Plugin),
	pinToRoom: make(map[string]string),
}

// Function to generate a new room ID
func generatePIN() (string, error) {
	const PINLength int = 6
	const maxTries = 1000

	for try := 0; try < maxTries; try++ {

		var pin, err = randomString(PINLength, Digits)
		if err != nil {
			log.Printf("failed to generate room ID: %s", err)
			return "", err
		}

		_, PINexists := connManager.pinToRoom[pin]
		if !PINexists {
			return pin, nil
		}
	}
	// No pin generated after maxTries
	return "", errors.New("PIN generation failed")
}

func generateVerificationCode() (string, error) {
	const length int = 4
	return randomString(length, ASCIILettersUppercase+Digits)
}

func rotatePIN(room *Room, oldPIN string) (newPIN string) {
	connManager.Lock()
	// Generate a new PIN
	newPIN, err := generatePIN()
	if err != nil {
		log.Println("Error generating new PIN:", err)
		connManager.Unlock()
		return oldPIN
	}
	connManager.pinToRoom[newPIN] = room.Id
	// Remove the old pin from mapping
	delete(connManager.pinToRoom, oldPIN)
	connManager.Unlock()

	roomPINMessageJSON, err := createPairingPINMessage(newPIN)
	if err != nil {
		room.Conn.Close()
		return ""
	}

	if err := room.Conn.WriteMessage(websocket.TextMessage, roomPINMessageJSON); err != nil {
		log.Println("write error:", err)
		room.Conn.Close()
		return ""
	}

	log.Printf("Rotated PIN for roomId: %s, pin: %s", room.Id, newPIN)
	return newPIN
}

// Forward messages between two WebSocket connections
func processMessageForwarding(src *websocket.Conn, dest *websocket.Conn, done chan struct{}, once *sync.Once) {
	defer func() {
		once.Do(func() { close(done) })
		src.Close()
		dest.Close()
	}()

	for {
		_, msg, err := src.ReadMessage()
		if err != nil {
			log.Println("read error:", err)
			return
		}

		if err := dest.WriteMessage(websocket.TextMessage, msg); err != nil {
			log.Println("write error:", err)
			return
		}
	}
}

func roomHandler(w http.ResponseWriter, r *http.Request) {
	roomConn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Println("upgrade error:", err)
		return
	}

	// Generate room ID
	var roomID = uuid.New().String()

	room := &Room{
		Id:    roomID,
		Conn:  roomConn,
		State: "new",
	}

	connManager.Lock()
	connManager.rooms[roomID] = room
	connManager.Unlock()

	// Handle incoming messages from the room
	for {
		_, msg, err := roomConn.ReadMessage()
		if err != nil {
			log.Println("read error:", err)

			handleRoomDisconnect(room)

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
			room.Config = registerRoomMessage.RoomConfig

			result := registerRoom(room)
			if result {
				room.State = "ready"
			}

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

			result, err := handleVerificationCodeResponseMessage(room, verificationCodeResponseMessage)
			if err != nil {
				log.Println("Error handling verification code response message:", err)
				break
			}

			if result {
				room.State = "verified"
			} else {
				// If verification failed, reset to ready state
				result := registerRoom(room)
				if result {
					room.State = "ready"
				}
			}

			break

		case "connected":
			// Room is connected to a plugin
			// Forward messages between the two connections

			// TODO move this to a separate function

			// Get plugin
			connManager.Lock()
			plugin := connManager.plugins[room.PluginID]
			connManager.Unlock()

			if err := plugin.Conn.WriteMessage(websocket.TextMessage, msg); err != nil {
				log.Println("write error:", err)
				handlePluginDisconnect(plugin)
			}

			break
		}
	}
}

func handleVerificationCodeResponseMessage(room *Room, msg VerificationCodeResponseMessage) (bool, error) {
	status := msg.Status

	// Get plugin
	connManager.Lock()
	plugin := connManager.plugins[room.PluginID]
	connManager.Unlock()

	if status {
		// Send VerificationCodeAcceptedMessage to plugin
		verificationCodeAcceptedMessage := VerificationCodeAcceptedMessage{
			Type:       MessageTypeVerificationCodeAccepted,
			RoomConfig: room.Config,
		}
		verificationCodeAcceptedMessageJSON, _ := json.Marshal(verificationCodeAcceptedMessage)

		if err := plugin.Conn.WriteMessage(websocket.TextMessage, verificationCodeAcceptedMessageJSON); err != nil {
			log.Println("write error to plugin:", err)
			handlePluginDisconnect(plugin)
			return false, err
		}
		log.Println("verification code accepted")

		return true, nil
	} else {
		// Send VerificationCodeRejectedMessage to plugin
		verificationCodeRejectedMessage := VerificationCodeRejectedMessage{
			Type: MessageTypeVerificationCodeRejected,
		}
		verificationCodeRejectedMessageJSON, _ := json.Marshal(verificationCodeRejectedMessage)

		if err := plugin.Conn.WriteMessage(websocket.TextMessage, verificationCodeRejectedMessageJSON); err != nil {
			log.Println("write error to plugin:", err)
			handlePluginDisconnect(plugin)
			return false, err
		}

		// Reset plugin roomID
		plugin.RoomID = ""

		return false, nil
	}
}

func registerRoom(room *Room) bool {
	// Generate PIN
	pin, err := generatePIN()
	if err != nil {
		log.Println("Error generating PIN:", err)
		handleRoomDisconnect(room)
		return false
	}

	connManager.Lock()
	connManager.pinToRoom[pin] = room.Id
	connManager.Unlock()

	// Create RoomPINMessage
	roomPINMessageJSON, err := createPairingPINMessage(pin)
	if err != nil {
		room.Conn.Close()
		// Remove room from connection manager
		connManager.Lock()
		delete(connManager.rooms, room.Id)
		delete(connManager.pinToRoom, pin)
		connManager.Unlock()
		return false
	}

	if err := room.Conn.WriteMessage(websocket.TextMessage, roomPINMessageJSON); err != nil {
		log.Println("write error:", err)
		room.Conn.Close()

		// Remove room from connection manager
		connManager.Lock()
		delete(connManager.rooms, room.Id)
		delete(connManager.pinToRoom, pin)
		connManager.Unlock()
		return false
	}

	log.Printf("Room connected with pin: %s, roomID: %s", pin, room.Id)

	currentPIN := pin

	ctx, cancel := context.WithCancel(context.Background())

	go func() {
		defer cancel()
		ticker := time.NewTicker(pinRotationInterval * time.Second)
		defer ticker.Stop()

		for {
			select {
			case <-ctx.Done():
				return

			case <-ticker.C:
				newPIN := rotatePIN(room, currentPIN)
				currentPIN = newPIN
			}
		}
	}()

	room.StopPinGen = cancel

	return true

}

func pluginHandler(w http.ResponseWriter, r *http.Request) {
	// pluginHandler to handle WebSocket connections from plugins
	// handle RoomPINMessage and PairingPINMessage

	pluginConn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Println("upgrade error:", err)
		return
	}

	// Generate plugin ID
	var pluginID = uuid.New().String()

	plugin := &Plugin{
		Id:   pluginID,
		Conn: pluginConn,
	}

	connManager.Lock()
	connManager.plugins[pluginID] = plugin
	connManager.Unlock()

	for {
		_, msg, err := pluginConn.ReadMessage()
		if err != nil {
			log.Println("read error:", err)
			handlePluginDisconnect(plugin)
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
		connManager.Lock()
		room := connManager.rooms[plugin.RoomID]
		connManager.Unlock()

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

			room := handlePairingPINMessage(plugin, pairingPINUserInputMessage)
			// room is null (invalid pin) wait for another attempt
			if room == nil {
				continue
			}

			plugin.RoomID = room.Id
			room.PluginID = plugin.Id
			log.Println("Connected to room with ID: ", room.Id)

			success := handleRoomVerification(plugin)
			if success {
				// Room is in verifying state
				room.State = "verifying"
			} else {
				// Failed to enter verifying state
				// TODO: Error handling, reset state
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

				forwardedLinks := handleRoomLinksMessage(plugin, joinURLsMessage)

				if forwardedLinks == false {
					log.Println("Error forwarding room links")
					continue
				}

				log.Println("Successfully forwarded room links")

				// Room is connected to a plugin
				// Change state to connected
				room.State = "connected"

				break
			case "connected":
				// Room is connected to a plugin
				// Forward messages between the two connections

				// TODO move this to a separate function

				if err := room.Conn.WriteMessage(websocket.TextMessage, msg); err != nil {
					log.Println("write error:", err)
					handleRoomDisconnect(room)
				}

				break
			}

		}
	}
}

func handleRoomLinksMessage(plugin *Plugin, msg JoinURLsMessage) bool {
	// Get room
	connManager.Lock()
	room := connManager.rooms[plugin.RoomID]
	connManager.Unlock()

	// Forward the JoinURLs message to the room
	roomConn := room.Conn
	messageJSON, _ := json.Marshal(msg)
	if err := roomConn.WriteMessage(websocket.TextMessage, messageJSON); err != nil {
		log.Println("write error to room:", err)
		handleRoomDisconnect(room)
		return false
	}

	return true
}

func handlePairingPINMessage(plugin *Plugin, pairingPINUserInputMessage PairingPINUserInputMessage) *Room {
	pin := pairingPINUserInputMessage.PIN

	connManager.Lock()
	roomID, exists := connManager.pinToRoom[pin]
	if !exists {
		log.Printf("Invalid pin received: %s", pin)
		connManager.Unlock()

		// Respond with an error message
		message := PairingPINFailedMessage{
			Type: MessageTypePairingPINFailed,
		}

		messageJSON, _ := json.Marshal(message)

		if err := plugin.Conn.WriteMessage(websocket.TextMessage, messageJSON); err != nil {
			log.Println("write error:", err)
			plugin.Conn.Close()
		}

		return nil
	}

	room := connManager.rooms[roomID]

	// Once paired, remove the pin from mapping
	delete(connManager.pinToRoom, pin)

	// Stop further PIN rotations
	connManager.rooms[roomID].StopPinGen()
	connManager.Unlock()

	log.Printf("Resolved room with roomID: %s for pin: %s", roomID, pin)

	return room
}

func handleRoomDisconnect(room *Room) {
	log.Printf("Room disconnected with ID: %s", room.Id)

	// Room disconnected, close the connection
	room.Conn.Close()

	log.Printf("Connection closed, start cleanup")

	// If room is ready, stop PIN generation
	if room.State == "ready" {
		log.Println("Stop pin gen")
		// Stop PIN generation
		room.StopPinGen()
	}

	// If room is registered, remove it from the connection manager
	if room.State != "new" {

		log.Printf("Remove room from connection manager")
		connManager.Lock()
		delete(connManager.rooms, room.Id)
		connManager.Unlock()
	}

	log.Println("Check if room was connected to a plugin")
	// If room is connected to a plugin, notify the plugin
	connManager.Lock()
	plugin := connManager.plugins[room.PluginID]
	connManager.Unlock()

	log.Printf("Plugin ID: %s", room.PluginID)

	if plugin != nil {
		// Send RoomDisconnected message to plugin
		roomDisconnectedMessage := RoomDisconnectedMessage{
			Type: MessageTypeRoomDisconnected,
		}
		roomDisconnectedMessageJSON, _ := json.Marshal(roomDisconnectedMessage)

		if err := plugin.Conn.WriteMessage(websocket.TextMessage, roomDisconnectedMessageJSON); err != nil {
			log.Println("write error to plugin:", err)
			handlePluginDisconnect(plugin)
		}

		// Reset plugin roomID
		plugin.RoomID = ""

	}

	// Remove room from connection manager
	connManager.Lock()
	delete(connManager.rooms, room.Id)
	connManager.Unlock()

	log.Printf("Room removed from connection manager")
}

func handlePluginDisconnect(plugin *Plugin) {
	log.Printf("Plugin disconnected with ID: %s", plugin.Id)

	// Plugin disconnected, close the connection
	plugin.Conn.Close()

	log.Printf("Connection closed, start cleanup")

	// Check if plugin was connected to a room
	if plugin.RoomID != "" {
		// Get room
		connManager.Lock()
		room := connManager.rooms[plugin.RoomID]
		connManager.Unlock()

		// If room is connected to the plugin, notify the room
		if room != nil {
			// Send PluginDisconnected message to room
			pluginDisconnectedMessage := PluginDisconnectedMessage{
				Type: MessageTypePluginDisconnected,
			}
			pluginDisconnectedMessageJSON, _ := json.Marshal(pluginDisconnectedMessage)

			if err := room.Conn.WriteMessage(websocket.TextMessage, pluginDisconnectedMessageJSON); err != nil {
				log.Println("write error to room:", err)
				handleRoomDisconnect(room)
			} else {
				// Reset room pluginID
				room.PluginID = ""

				// Reset room state to ready
				result := registerRoom(room)
				if result {
					room.State = "ready"
				}
			}

		}
	}

	// Remove plugin from connection manager
	connManager.Lock()
	delete(connManager.plugins, plugin.Id)
	connManager.Unlock()
}

func handleRoomVerification(plugin *Plugin) bool {
	// Get room
	connManager.Lock()
	room := connManager.rooms[plugin.RoomID]
	connManager.Unlock()

	roomConn := room.Conn

	// Generate verification code
	var verificationCode, _ = generateVerificationCode()

	log.Printf("Generated verification code: %s", verificationCode)

	// Generate PairingPINFound message
	pairingPINFoundMessage := PairingPINFoundMessage{
		Type:             MessageTypePairingPINFound,
		VerificationCode: verificationCode,
	}
	pairingPINFoundMessageJSON, _ := json.Marshal(pairingPINFoundMessage)

	// Send PairingPINFound message to plugin
	if err := plugin.Conn.WriteMessage(websocket.TextMessage, pairingPINFoundMessageJSON); err != nil {
		log.Println("write error to room:", err)
		handlePluginDisconnect(plugin)
		return false
	}

	// Generate VerificationCodeMessage
	verificationCodeMessage := VerificationCodeMessage{
		Type:             MessageTypeVerificationCode,
		VerificationCode: verificationCode,
	}
	verificationCodeMessageJSON, _ := json.Marshal(verificationCodeMessage)

	// Send VerificationCodeMessage to room
	if err := roomConn.WriteMessage(websocket.TextMessage, verificationCodeMessageJSON); err != nil {
		log.Println("write error to room:", err)
		handleRoomDisconnect(room)
		return false
	}

	return true
}

func main() {
	validate = validator.New()

	http.HandleFunc("/ws_room", roomHandler)
	http.HandleFunc("/ws_plugin", pluginHandler)

	host := os.Getenv("BBB_ROOM_HUB_HOST")
	port := os.Getenv("BBB_ROOM_HUB_PORT")

	// If host is set use it, otherwise use default 0.0.0.0
	if host == "" {
		host = "0.0.0.0"
	}

	// If port is set to use it, otherwise use default 8080
	if port == "" {
		port = "8080"
	}

	log.Printf("WebSocket server started on %s:%s", host, port)
	err := http.ListenAndServe(host+":"+port, nil)
	if err != nil {
		log.Fatal("ListenAndServe: ", err)
	}
}
