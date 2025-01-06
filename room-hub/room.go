package main

import (
	"context"
	"encoding/json"
	"github.com/google/uuid"
	"github.com/gorilla/websocket"
	"github.com/rs/zerolog/log"
	"net"
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

	ip, _, _ := net.SplitHostPort(conn.RemoteAddr().String())
	log.Info().Str("room", roomID).Str("ip", ip).Msg("New room created")

	return room
}

func (room *Room) getPlugin() *Plugin {
	return connManager.getPlugin(room.PluginID)
}

func (room *Room) rotatePIN() bool {
	// Generate a new PIN
	newPIN, err := connManager.generatePIN()
	if err != nil {
		log.Error().Err(err).Str("room", room.Id).Msg("Failed to generate PIN")
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

	log.Debug().Str("room", room.Id).Msg("Generated new PIN")
	return true
}

func (room *Room) acceptConnection() {
	plugin := room.getPlugin()

	log.Info().Str("room", room.Id).Str("plugin", plugin.Id).Msg("Connection accepted")

	// Send VerificationCodeAcceptedMessage to plugin
	verificationCodeAcceptedMessage := VerificationCodeAcceptedMessage{
		Type:       MessageTypeVerificationCodeAccepted,
		RoomConfig: room.Config,
	}

	if !plugin.sendMessage(verificationCodeAcceptedMessage) {
		return
	}

	room.State = "verified"
}

func (room *Room) rejectConnection() {
	plugin := room.getPlugin()

	log.Info().Str("room", room.Id).Str("plugin", plugin.Id).Msg("Connection rejected")

	// Send VerificationCodeRejectedMessage to plugin
	verificationCodeRejectedMessage := VerificationCodeRejectedMessage{
		Type: MessageTypeVerificationCodeRejected,
	}

	if !plugin.sendMessage(verificationCodeRejectedMessage) {
		return
	}

	// Disconnect from plugin
	room.disconnect()
}

func (room *Room) startPinGen() bool {

	if !room.rotatePIN() {
		return false
	}

	log.Info().Str("room", room.Id).Msg("Ready for pairing")

	ctx, cancel := context.WithCancel(context.Background())

	go func() {
		defer cancel()
		ticker := time.NewTicker(pinRotationInterval * time.Second)
		defer ticker.Stop()

		for {
			select {
			case <-ctx.Done():
				log.Debug().Str("room", room.Id).Msg("PIN generation stopped")
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

func (room *Room) close() {
	log.Warn().Str("room", room.Id).Msg("Websocket connection closed")

	// If room is ready, stop PIN generation
	if room.State == "ready" {
		// Stop PIN generation
		room.StopPinGen()
	}

	// Room disconnected, close the connection
	room.Conn.Close()

	room.State = "closing"

	room.disconnect()

	// Remove room from connection manager
	connManager.removeRoom(room)
}

func (room *Room) disconnect() {
	// Get plugin
	plugin := room.getPlugin()

	// Check if room was connected to a plugin
	if plugin != nil {
		log.Info().Str("room", room.Id).Str("plugin", plugin.Id).Msg("Disconnecting room from plugin")

		// Reset room pluginID
		room.PluginID = ""

		// Send RoomDisconnected message to plugin
		roomDisconnectedMessage := RoomDisconnectedMessage{
			Type: MessageTypeRoomDisconnected,
		}

		plugin.sendMessage(roomDisconnectedMessage)

		// Reset plugin
		plugin.disconnect()
	}

	// Reset room state to ready
	if room.State != "closing" {
		room.startPinGen()
	}
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

	log.Info().Str("room", room.Id).Str("plugin", plugin.Id).Msg("Verifying connection")

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

	log.Info().Str("room", room.Id).Msg("Room registered")

	room.startPinGen()
}

func (room *Room) sendMessage(message any) bool {

	messageJSON, err := json.Marshal(message)
	if err != nil {
		log.Error().Err(err).Str("room", room.Id).Msg("Failed to marshal message")
		return false
	}

	if err := room.Conn.WriteMessage(websocket.TextMessage, messageJSON); err != nil {
		log.Error().Err(err).Str("room", room.Id).Msg("Websocket write error")
		room.close()
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
		return
	}

	log.Info().Str("room", room.Id).Str("plugin", room.getPlugin().Id).Msg("Connection established, forwarded room links")

	room.State = "connected"
}
