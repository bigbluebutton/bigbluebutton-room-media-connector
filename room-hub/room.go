package main

import (
	"context"
	"encoding/json"
	"github.com/google/uuid"
	"github.com/gorilla/websocket"
	"log"
	"time"
)

const pinRotationInterval = 10 // Interval in seconds

func generateVerificationCode() (string, error) {
	const length int = 4
	return randomString(length, ASCIILettersUppercase+Digits)
}

type Room struct {
	Id         string
	Conn       *websocket.Conn
	PluginID   string
	Config     RoomConfig
	State      string
	PairingPIN string
	StopPinGen context.CancelFunc
}

func newRoom(conn *websocket.Conn) *Room {
	// Generate room ID
	var roomID = uuid.New().String()

	room := &Room{
		Id:    roomID,
		Conn:  conn,
		State: "new",
	}

	return room
}

func (room *Room) getPlugin() *Plugin {
	return connManager.getPlugin(room.PluginID)
}

func (room *Room) rotatePIN() bool {
	// Generate a new PIN
	newPIN, err := connManager.generatePIN()
	if err != nil {
		log.Printf("Error generating PIN for roomID %s, error: %v", room.Id, err)
		return false
	}

	connManager.removeRoomPIN(room)
	room.PairingPIN = newPIN
	connManager.addRoomPIN(room)

	roomPINMessage := PairingPINMessage{
		Type: MessageTypePairingPIN,
		PIN:  newPIN,
	}

	if !room.sendMessage(roomPINMessage) {
		return false
	}

	log.Printf("New PIN for roomId: %s, pin: %s", room.Id, newPIN)
	return true
}

func (room *Room) acceptConnection() {
	plugin := room.getPlugin()

	// Send VerificationCodeAcceptedMessage to plugin
	verificationCodeAcceptedMessage := VerificationCodeAcceptedMessage{
		Type:       MessageTypeVerificationCodeAccepted,
		RoomConfig: room.Config,
	}

	if !plugin.sendMessage(verificationCodeAcceptedMessage) {
		return
	}

	log.Println("verification code accepted")

	room.State = "verified"
}

func (room *Room) rejectConnection() {
	plugin := room.getPlugin()

	// Send VerificationCodeRejectedMessage to plugin
	verificationCodeRejectedMessage := VerificationCodeRejectedMessage{
		Type: MessageTypeVerificationCodeRejected,
	}

	if !plugin.sendMessage(verificationCodeRejectedMessage) {
		return
	}

	// Reset plugin roomID
	plugin.reset()

	room.startPinGen()
}

func (room *Room) startPinGen() bool {

	if !room.rotatePIN() {
		return false
	}

	log.Printf("Room roomID: %s ready for pairing with pin: %s,", room.Id, room.PairingPIN)

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
				room.rotatePIN()
			}
		}
	}()

	room.StopPinGen = cancel

	room.State = "ready"

	return true

}

func (room *Room) disconnect() {
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

	log.Println("Check if room was connected to a plugin")
	// If room is connected to a plugin, notify the plugin
	plugin := room.getPlugin()

	log.Printf("Plugin ID: %s", room.PluginID)

	if plugin != nil {
		// Send RoomDisconnected message to plugin
		roomDisconnectedMessage := RoomDisconnectedMessage{
			Type: MessageTypeRoomDisconnected,
		}

		plugin.sendMessage(roomDisconnectedMessage)

		// Reset plugin
		plugin.reset()
	}

	// Remove room from connection manager
	connManager.removeRoom(room)

	log.Printf("Room removed from connection manager")
}

func (room *Room) pairWithPlugin(plugin *Plugin) {
	// Once paired, remove the pin from mapping
	connManager.removeRoomPIN(room)

	// Stop further PIN rotations
	room.StopPinGen()

	// Add plugin ID to room
	room.PluginID = plugin.Id
}

func (room *Room) verifyConnection() {
	// Get plugin
	plugin := room.getPlugin()

	// Generate verification code
	var verificationCode, _ = generateVerificationCode()

	log.Printf("Verifying connection between roomID %s and pluginID %s: Verification code %s", room.Id, plugin.Id, verificationCode)

	// Generate PairingPINFound message
	pairingPINFoundMessage := PairingPINFoundMessage{
		Type:             MessageTypePairingPINFound,
		VerificationCode: verificationCode,
	}

	// Send PairingPINFound message to plugin
	if !plugin.sendMessage(pairingPINFoundMessage) {
		return
	}

	// Generate VerificationCodeMessage
	verificationCodeMessage := VerificationCodeMessage{
		Type:             MessageTypeVerificationCode,
		VerificationCode: verificationCode,
	}

	// Send VerificationCodeMessage to room
	if !room.sendMessage(verificationCodeMessage) {
		return
	}

	// Room is in verifying state
	room.State = "verifying"

	return
}

func (room *Room) register(config RoomConfig) {
	room.Config = config

	room.startPinGen()
}

func (room *Room) sendMessage(message any) bool {

	messageJSON, err := json.Marshal(message)
	if err != nil {
		log.Printf("failed to marshal message")
		return false
	}

	if err := room.Conn.WriteMessage(websocket.TextMessage, messageJSON); err != nil {
		log.Println("write error:", err)
		room.disconnect()
		return false
	}

	return true
}

func (room *Room) connect(joinUrls JoinURLs) {

	// Send JoinURLs message to room
	joinURLsMessage := JoinURLsMessage{
		Type:     MessageTypeJoinURLs,
		JoinURLs: joinUrls,
	}

	if !room.sendMessage(joinURLsMessage) {
		log.Println("Error forwarding room links")
		return
	}

	log.Println("Successfully forwarded room links")

	room.State = "connected"
}

func (room *Room) reset() {
	// Reset room pluginID
	room.PluginID = ""

	// Reset room state to ready
	room.startPinGen()
}
