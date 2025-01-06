package main

import (
	"encoding/json"
	"github.com/google/uuid"
	"github.com/gorilla/websocket"
	"github.com/rs/zerolog/log"
	"net"
)

type Plugin struct {
	Id     string
	RoomID string
	Conn   *websocket.Conn
}

func newPlugin(conn *websocket.Conn) *Plugin {
	// Generate plugin ID
	var pluginID = uuid.New().String()

	plugin := &Plugin{
		Id:   pluginID,
		Conn: conn,
	}

	ip, _, _ := net.SplitHostPort(conn.RemoteAddr().String())
	log.Info().Str("plugin", pluginID).Str("ip", ip).Msg("New plugin created")

	return plugin
}

func (plugin *Plugin) getRoom() *Room {
	return connManager.getRoom(plugin.RoomID)
}

func (plugin *Plugin) pairWithRoom(pin string) *Room {
	room := connManager.getRoomByPIN(pin)
	if room == nil {
		log.Warn().Str("plugin", plugin.Id).Msg("Pairing failed, invalid PIN")

		// Respond with an error message
		message := PairingPINFailedMessage{
			Type: MessageTypePairingPINFailed,
		}

		plugin.sendMessage(message)

		return nil
	}

	room.pairWithPlugin(plugin)

	plugin.RoomID = room.Id

	log.Info().Str("room", room.Id).Str("plugin", plugin.Id).Msg("Pairing successfully")

	room.verifyConnection()

	return room
}

func (plugin *Plugin) close() {
	log.Warn().Str("plugin", plugin.Id).Msg("Websocket connection closed")

	// Plugin disconnected, close the connection
	plugin.Conn.Close()

	plugin.disconnect()

	// Remove plugin from connection manager
	connManager.removePlugin(plugin)
}

func (plugin *Plugin) disconnect() {
	// Get room
	room := plugin.getRoom()

	// Check if plugin was connected to a room
	if room != nil {
		log.Info().Str("plugin", plugin.Id).Str("room", room.Id).Msg("Disconnecting plugin from room")

		// Reset plugin roomID
		plugin.RoomID = ""

		// Send PluginDisconnected message to room
		pluginDisconnectedMessage := PluginDisconnectedMessage{
			Type: MessageTypePluginDisconnected,
		}

		room.sendMessage(pluginDisconnectedMessage)

		room.disconnect()
	}
}

func (plugin *Plugin) sendMessage(message any) bool {

	messageJSON, err := json.Marshal(message)
	if err != nil {
		log.Error().Err(err).Str("plugin", plugin.Id).Msg("Failed to marshal message")
		return false
	}

	if err := plugin.Conn.WriteMessage(websocket.TextMessage, messageJSON); err != nil {
		log.Error().Err(err).Str("plugin", plugin.Id).Msg("Websocket write error")
		plugin.close()
		return false
	}
	return true
}
