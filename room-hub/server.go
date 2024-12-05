package main

import (
	"crypto/rand"
	"encoding/json"
	"errors"
	"github.com/go-playground/validator/v10"
	"log"
	"math/big"
	"net/http"
	"os"
	"strconv"
	"sync"
	"time"

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
	pinToRoom map[int]string // Used to look up roomID via room PIN
}

// Struct to store room connection and configuration
type Room struct {
	Conn       *websocket.Conn
	Config     RoomConfig
	StopPinGen chan struct{}
}

// Initialize ConnectionManager instance
var connManager = &ConnectionManager{
	rooms:     make(map[string]*Room),
	pinToRoom: make(map[int]string),
}

// Function to generate a new room ID
func generatePIN() (int, error) {
	const PINLength int = 6
	const maxTries = 1000

	for try := 0; try < maxTries; try++ {

		var pin, err = randomString(PINLength, Digits)
		if err != nil {
			log.Printf("failed to generate room ID: %s", err)
			return 0, err
		}

		var pinInt, _ = strconv.Atoi(pin)

		_, PINexists := connManager.pinToRoom[pinInt]
		if !PINexists {
			return pinInt, nil
		}
	}
	// No pin generated after maxTries
	return 0, errors.New("PIN generation failed")
}

func generateVerificationCode() (string, error) {
	const length int = 4
	return randomString(length, ASCIILettersUppercase+Digits)
}

func rotatePIN(roomID string, oldPIN int, roomConn *websocket.Conn) (newPIN int) {
	connManager.Lock()
	// Generate a new PIN
	newPIN, err := generatePIN()
	if err != nil {
		log.Println("Error generating new PIN:", err)
		connManager.Unlock()
		return oldPIN
	}
	connManager.pinToRoom[newPIN] = roomID
	// Remove the old pin from mapping
	delete(connManager.pinToRoom, oldPIN)
	connManager.Unlock()

	roomPINMessageJSON, err := createPairingPINMessage(newPIN)
	if err != nil {
		roomConn.Close()
		return 0
	}

	if err := roomConn.WriteMessage(websocket.TextMessage, roomPINMessageJSON); err != nil {
		log.Println("write error:", err)
		roomConn.Close()
		return 0
	}

	log.Printf("Rotated PIN for roomId: %s, pin: %d", roomID, newPIN)
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

	for {
		_, msg, err := roomConn.ReadMessage()
		if err != nil {
			log.Println("read error:", err)
			roomConn.Close()
			return
		}

		// Proceed with the existing logic for MessageTypeRegisterRoom
		var registerRoomMessage RegisterRoomMessage

		err = json.Unmarshal(msg, &registerRoomMessage)
		if err != nil || registerRoomMessage.Type != MessageTypeRegisterRoom {
			log.Printf("Error unmarshalling RegisterRoomMessage: %s", err)
			continue
		}

		err = validate.Struct(registerRoomMessage)
		if err != nil {
			log.Printf("Error validating RegisterRoomMessage: %s", err)
			continue
		}

		handleRegisterRoomMessage(roomConn, registerRoomMessage)
	}
}

func handleRegisterRoomMessage(roomConn *websocket.Conn, msg RegisterRoomMessage) {

	// Generate room ID
	roomID := uuid.New().String()

	// Generate PIN
	pin, err := generatePIN()
	if err != nil {
		log.Println("Error generating PIN:", err)
		// TODO error handling, let application know that room creation failed and should try again
		err := roomConn.Close()
		if err != nil {
			log.Println("Failed to close connection")
			return
		}
		log.Println("Closed connection")
		return
	}

	log.Println("RoomConfig:", msg.RoomConfig)

	room := &Room{
		Conn:       roomConn,
		Config:     msg.RoomConfig,
		StopPinGen: make(chan struct{}),
	}

	connManager.Lock()
	connManager.rooms[roomID] = room
	connManager.pinToRoom[pin] = roomID
	connManager.Unlock()

	log.Printf("Registered room with ID: %s", roomID)

	// Create RoomPINMessage
	roomPINMessageJSON, err := createPairingPINMessage(pin)
	if err != nil {
		roomConn.Close()
		return
	}

	if err := roomConn.WriteMessage(websocket.TextMessage, roomPINMessageJSON); err != nil {
		log.Println("write error:", err)
		roomConn.Close()
		return
	}

	log.Printf("Room connected with pin: %d, roomID: %s", pin, roomID)

	currentPIN := pin
	go func() {
		stopChan := connManager.rooms[roomID].StopPinGen
		for {
			select {
			case <-stopChan:
				log.Println("Stopped PIN generation for roomID:", roomID)
				return
			case <-time.After(pinRotationInterval * time.Second):
				newPIN := rotatePIN(roomID, currentPIN, roomConn)
				currentPIN = newPIN
			}
		}
	}()
	select {}
}

func pluginHandler(w http.ResponseWriter, r *http.Request) {
	// pluginHandler to handle WebSocket connections from plugins
	// handle RoomPINMessage and PairingPINMessage

	pluginConn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Println("upgrade error:", err)
		return
	}

	for {
		_, msg, err := pluginConn.ReadMessage()
		if err != nil {
			log.Println("read error:", err)
			pluginConn.Close()
			return
		}

		// First message of plugin must be PairingPINUserInputMessage
		var pairingPINUserInputMessage PairingPINUserInputMessage
		err = json.Unmarshal(msg, &pairingPINUserInputMessage)
		if err != nil || pairingPINUserInputMessage.Type != MessageTypePairingPINUserInput {
			log.Printf("Error parsing PairingPINUserInputMessage: %s", msg)
			continue
		}

		err = validate.Struct(pairingPINUserInputMessage)
		if err != nil {
			log.Printf("Error validating PairingPINUserInputMessage: %s", err)
			continue
		}

		room := handlePairingPINMessage(pluginConn, pairingPINUserInputMessage)

		// room is null (invalid pin) wait for another attempt
		if room == nil {
			continue
		}

		verified := handleRoomVerification(pluginConn, room)

		// if connection was not verified, wait for new connection attempt
		if verified == false {
			continue
		}

		forwardedLinks := handleRoomLinksMessage(pluginConn, room)

		if forwardedLinks == false {
			log.Println("Error forwarding room links")
			// TODO Error message, start all over again
			continue
		}

		log.Println("Successfully forwarded room links")

		// TODO: implement full websocket connection between plugin and room

		done := make(chan struct{})
		var once sync.Once
		go processMessageForwarding(room.Conn, pluginConn, done, &once)
		go processMessageForwarding(pluginConn, room.Conn, done, &once)

		return
	}
}

func handleRoomLinksMessage(pluginConn *websocket.Conn, room *Room) bool {
	for {
		_, msg, err := pluginConn.ReadMessage()
		if err != nil {
			log.Println("read error:", err)
			pluginConn.Close()
			return false
		}

		// Unmarshal the received message into the JoinURLsMessage struct
		var joinURLsMessage JoinURLsMessage
		err = json.Unmarshal(msg, &joinURLsMessage)
		if err != nil || joinURLsMessage.Type != MessageTypeJoinURLs {
			log.Printf("Error parsing joinURLsMessage: %s", msg)
			continue
		}

		err = validate.Struct(joinURLsMessage)
		if err != nil {
			log.Printf("Error validating JoinURLsMessage: %s", err)
			continue
		}

		// Forward the JoinURLs message to the room
		roomConn := room.Conn
		if err := roomConn.WriteMessage(websocket.TextMessage, msg); err != nil {
			log.Println("write error to room:", err)
			roomConn.Close()
			return false
		}

		return true
	}
}

func handleVerificationResponse(roomConn *websocket.Conn) bool {
	for {
		_, msg, err := roomConn.ReadMessage()
		if err != nil {
			log.Println("read error:", err)
			roomConn.Close()
			return false
		}

		var verificationCodeResponseMessage VerificationCodeResponseMessage
		err = json.Unmarshal(msg, &verificationCodeResponseMessage)
		if err != nil || verificationCodeResponseMessage.Type != MessageTypeVerificationCodeResponse {
			log.Printf("Error parsing VerificationCodeResponse: %s", err)
			continue
		}

		err = validate.Struct(verificationCodeResponseMessage)
		if err != nil {
			log.Printf("Error validating VerificationCodeResponseMessage: %s", err)
			continue
		}

		return verificationCodeResponseMessage.Status
	}
}

func handlePairingPINMessage(pluginConn *websocket.Conn, pairingPINUserInputMessage PairingPINUserInputMessage) *Room {
	pin := pairingPINUserInputMessage.PIN

	connManager.Lock()
	roomID, exists := connManager.pinToRoom[pin]
	if !exists {
		log.Printf("Invalid pin received: %d", pin)
		connManager.Unlock()

		// Respond with an error message
		message := PairingPINFailedMessage{
			Type: MessageTypePairingPINFailed,
		}

		messageJSON, _ := json.Marshal(message)

		if err := pluginConn.WriteMessage(websocket.TextMessage, messageJSON); err != nil {
			log.Println("write error:", err)
			pluginConn.Close()
		}

		return nil
	}

	room := connManager.rooms[roomID]

	// Once paired, remove the pin from mapping
	delete(connManager.pinToRoom, pin)

	// Stop further PIN rotations
	stopChan := connManager.rooms[roomID].StopPinGen
	close(stopChan)
	connManager.Unlock()

	log.Printf("Resolved room with roomID: %s for pin: %d", roomID, pin)

	return room
}

func handleRoomVerification(pluginConn *websocket.Conn, room *Room) bool {
	roomConn := room.Conn
	roomConfig := room.Config

	log.Printf("Room config: %s", roomConfig) // Access the RoomConfig here

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
	if err := pluginConn.WriteMessage(websocket.TextMessage, pairingPINFoundMessageJSON); err != nil {
		log.Println("write error to room:", err)
		roomConn.Close()
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
		roomConn.Close()
		return false
	}

	status := handleVerificationResponse(roomConn)

	if status {
		// Send VerificationCodeAcceptedMessage to plugin
		verificationCodeAcceptedMessage := VerificationCodeAcceptedMessage{
			Type:       MessageTypeVerificationCodeAccepted,
			RoomConfig: roomConfig,
		}
		verificationCodeAcceptedMessageJSON, _ := json.Marshal(verificationCodeAcceptedMessage)

		if err := pluginConn.WriteMessage(websocket.TextMessage, verificationCodeAcceptedMessageJSON); err != nil {
			log.Println("write error to plugin:", err)
			pluginConn.Close()
			return false
		}
		log.Println("verification code accepted")

		return true
	} else {
		// Send VerificationCodeRejectedMessage to plugin
		verificationCodeRejectedMessage := VerificationCodeRejectedMessage{
			Type: MessageTypeVerificationCodeRejected,
		}
		verificationCodeRejectedMessageJSON, _ := json.Marshal(verificationCodeRejectedMessage)

		if err := pluginConn.WriteMessage(websocket.TextMessage, verificationCodeRejectedMessageJSON); err != nil {
			log.Println("write error to plugin:", err)
			pluginConn.Close()
			return false
		}

		return false
	}

}

func main() {
	validate = validator.New()

	http.HandleFunc("/ws_room", roomHandler)
	http.HandleFunc("/ws_plugin", pluginHandler)

	host := os.Getenv("BBB_ROOM_HUB_HOST")
	port := os.Getenv("BBB_ROOM_HUB_PORT")

	// If host is set use it, otherwise use default localhost
	if host == "" {
		host = "127.0.0.1"
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
