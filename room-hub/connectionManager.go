package main

import (
	"errors"
	"log"
	"sync"
)

// Struct to hold connection pairs and mutex for thread safety
type ConnectionManager struct {
	sync.Mutex
	rooms     map[string]*Room
	plugins   map[string]*Plugin
	pinToRoom map[string]string // Used to look up roomID via room PIN
}

func (connectionManager *ConnectionManager) addRoom(room *Room) {
	connectionManager.Lock()
	connectionManager.rooms[room.Id] = room
	connectionManager.Unlock()
}

func (connectionManager *ConnectionManager) getRoom(id string) *Room {
	connectionManager.Lock()
	room := connectionManager.rooms[id]
	connectionManager.Unlock()

	return room
}
func (connectionManager *ConnectionManager) removeRoom(room *Room) {
	connectionManager.Lock()
	delete(connectionManager.rooms, room.Id)
	connectionManager.Unlock()

	// Remove room PIN
	connectionManager.removeRoomPIN(room)
}

func (connectionManager *ConnectionManager) addPlugin(plugin *Plugin) {
	connectionManager.Lock()
	connectionManager.plugins[plugin.Id] = plugin
	connectionManager.Unlock()
}
func (connectionManager *ConnectionManager) getPlugin(id string) *Plugin {
	connectionManager.Lock()
	plugin := connectionManager.plugins[id]
	connectionManager.Unlock()

	return plugin
}
func (connectionManager *ConnectionManager) removePlugin(plugin *Plugin) {
	connectionManager.Lock()
	delete(connectionManager.plugins, plugin.Id)
	connectionManager.Unlock()
}

// Add room to pinToRoom map
func (connectionManager *ConnectionManager) addRoomPIN(room *Room) {
	connectionManager.Lock()
	connectionManager.pinToRoom[room.PairingPIN] = room.Id
	connectionManager.Unlock()
}

// Function to generate a new room ID
func (connectionManager *ConnectionManager) generatePIN() (string, error) {
	const PINLength int = 6
	const maxTries = 1000

	for try := 0; try < maxTries; try++ {

		var pin, err = randomString(PINLength, Digits)
		if err != nil {
			log.Printf("failed to generate room ID: %s", err)
			return "", err
		}

		connectionManager.Lock()
		_, exists := connectionManager.pinToRoom[pin]
		connectionManager.Unlock()

		if !exists {
			return pin, nil
		}
	}
	// No pin generated after maxTries
	return "", errors.New("PIN generation failed")
}

// Get room by PIN
func (connectionManager *ConnectionManager) getRoomByPIN(pin string) *Room {
	connectionManager.Lock()
	roomID, exists := connectionManager.pinToRoom[pin]
	connectionManager.Unlock()

	if !exists {
		return nil
	}

	return connectionManager.getRoom(roomID)
}

// Remove room from pinToRoom map
func (connectionManager *ConnectionManager) removeRoomPIN(room *Room) {
	connectionManager.Lock()
	delete(connectionManager.pinToRoom, room.PairingPIN)
	connectionManager.Unlock()
}
