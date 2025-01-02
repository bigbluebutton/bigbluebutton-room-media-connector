package main

import (
	"encoding/json"
	"github.com/google/uuid"
	"github.com/gorilla/websocket"
	"log"
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

	return plugin
}

func (plugin *Plugin) getRoom() *Room {
	return connManager.getRoom(plugin.RoomID)
}

func (plugin *Plugin) pairWithRoom(pin string) *Room {
	room := connManager.getRoomByPIN(pin)
	if room == nil {
		log.Printf("Pairing with pin %s failed", pin)

		// Respond with an error message
		message := PairingPINFailedMessage{
			Type: MessageTypePairingPINFailed,
		}

		messageJSON, _ := json.Marshal(message)

		plugin.sendMessage(messageJSON)

		return nil
	}

	room.pairWithPlugin(plugin)

	plugin.RoomID = room.Id

	log.Printf("Pairing with pin %s started, connecting to roomId %s", pin, room.Id)

	room.verifyConnection()

	return room
}

func (plugin *Plugin) disconnect() {
	log.Printf("Plugin disconnected with ID: %s", plugin.Id)

	// Plugin disconnected, close the connection
	plugin.Conn.Close()

	log.Printf("Connection closed, start cleanup")

	// Check if plugin was connected to a room
	if plugin.RoomID != "" {
		// Get room
		room := plugin.getRoom()

		// If room is connected to the plugin, notify the room
		if room != nil {
			// Send PluginDisconnected message to room
			pluginDisconnectedMessage := PluginDisconnectedMessage{
				Type: MessageTypePluginDisconnected,
			}
			pluginDisconnectedMessageJSON, _ := json.Marshal(pluginDisconnectedMessage)

			if room.sendMessage(pluginDisconnectedMessageJSON) {
				// Reset room
				room.reset()
			}
		}
	}

	// Remove plugin from connection manager
	connManager.removePlugin(plugin)
}

func (plugin *Plugin) sendMessage(msg []byte) bool {
	if err := plugin.Conn.WriteMessage(websocket.TextMessage, msg); err != nil {
		log.Println("write error:", err)
		plugin.disconnect()
		return false
	}
	return true
}

func (plugin *Plugin) reset() {
	// Reset plugin roomID
	plugin.RoomID = ""
}
