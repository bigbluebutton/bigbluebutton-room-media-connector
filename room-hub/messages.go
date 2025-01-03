package main

import (
	"encoding/json"
	"errors"
	"log"
)

// Define custom types and constants for the Type field
type MessageType string

const (
	MessageTypePing                     MessageType = "Ping"                     // ping
	MessageTypePairingPIN               MessageType = "PairingPIN"               // assign pin to room (server -> appliance)
	MessageTypeRegisterRoom             MessageType = "RegisterRoom"             // appliance registers with room config (appliance -> server)
	MessageTypePairingPINUserInput      MessageType = "PairingPINUserInput"      // connect to room (plugin -> server)
	MessageTypePairingPINFound          MessageType = "PairingPINFound"          // response from server to plugin if pin was correct (server -> plugin)
	MessageTypePairingPINFailed         MessageType = "PairingPINFailed"         // response from server to plugin if pin was not found (server -> plugin)
	MessageTypeVerificationCode         MessageType = "VerificationCode"         // server -> appliance
	MessageTypeVerificationCodeResponse MessageType = "VerificationCodeResponse" // the user checks on the appliance if the verification code is correct
	MessageTypeVerificationCodeAccepted MessageType = "VerificationCodeAccepted" // the server sends a message to the plugin that the verification code was accepted and the config
	MessageTypeVerificationCodeRejected MessageType = "VerificationCodeRejected" //  the server sends a message to the plugin that the verification code was not accepted
	MessageTypeJoinURLs                 MessageType = "JoinURLs"                 // the plugin generates join urls for the room appliance, this message is send from the plugin to the server and then forwarded to the appliance
	MessageTypeRoomDisconnected         MessageType = "RoomDisconnected"         // the server sends a message to the plugin that the room appliance has disconnected
	MessageTypePluginDisconnected       MessageType = "PluginDisconnected"       // the server sends a message to the plugin that the plugin has disconnected
	MessageTypeInvalid                  MessageType = "Invalid"                  // invalid message
	MessageTypeData                     MessageType = "Data"                     // data message
)

// Messages
type BaseMessage struct {
	Type       MessageType `json:"type" validate:"required"`
	rawMessage []byte
}

type PingMessage struct {
	Type MessageType `json:"type" validate:"required"`
}

type RegisterRoomMessage struct {
	Type       MessageType `json:"type" validate:"required"`
	RoomConfig RoomConfig  `json:"roomConfig" validate:"required"`
}

type RoomConfig struct {
	BBBUserName string                 `json:"bbb_user_name" validate:"required"`
	BBBUserID   string                 `json:"bbb_user_id" validate:"required"`
	Layouts     map[string]interface{} `json:"layouts" validate:"required"`
}

type PairingPINUserInputMessage struct {
	Type MessageType `json:"type" validate:"required"`
	PIN  string      `json:"PIN" validate:"required,numeric,len=6"`
}

type PairingPINMessage struct {
	Type MessageType `json:"type" validate:"required"`
	PIN  string      `json:"PIN" validate:"required"`
}

type PairingPINFoundMessage struct {
	Type             MessageType `json:"type" validate:"required"`
	VerificationCode string      `json:"verification_code" validate:"required,len=4"`
}

type PairingPINFailedMessage struct {
	Type MessageType `json:"type" validate:"required"`
}

type VerificationCodeMessage struct {
	Type             MessageType `json:"type" validate:"required"`
	VerificationCode string      `json:"verification_code" validate:"required,len=4"`
}

type VerificationCodeAcceptedMessage struct {
	Type       MessageType `json:"type" validate:"required"`
	RoomConfig RoomConfig  `json:"roomConfig" validate:"required"`
}

type VerificationCodeResponseMessage struct {
	Type   MessageType `json:"type" validate:"required"`
	Status bool        `json:"status" validate:"boolean"`
}

type VerificationCodeRejectedMessage struct {
	Type MessageType `json:"type" validate:"required"`
}

type JoinURLsMessage struct {
	Type     MessageType `json:"type" validate:"required"`
	JoinURLs JoinURLs    `json:"urls" validate:"required"`
}

// JoinURLs can contain one or more URLs.
type JoinURLs struct {
	ControlURL string                 `json:"control" validate:"required"`
	ScreenURLs map[string]interface{} `json:"screens" validate:"required"`
}

// Room Disconnected Message
type RoomDisconnectedMessage struct {
	Type MessageType `json:"type" validate:"required"`
}

// Plugin Disconnected Message
type PluginDisconnectedMessage struct {
	Type MessageType `json:"type" validate:"required"`
}

type InvalidMessage struct {
	Type MessageType `json:"type" validate:"required"`
}

type DataMessage struct {
	Type MessageType `json:"type" validate:"required"`
	Data any         `json:"data" validate:"required"`
}

func parseMessage(msg []byte) (BaseMessage, error) {
	// Check if message can be parsed into the base format all messages use
	var baseMessage BaseMessage
	baseMessage.rawMessage = msg
	err := json.Unmarshal(msg, &baseMessage)
	if err != nil {
		log.Printf("Error parsing message: %s", msg)
		baseMessage.Type = MessageTypeInvalid
		return baseMessage, err
	}
	err = validate.Struct(baseMessage)
	if err != nil {
		log.Printf("Message format invalid: %s", err)
		baseMessage.Type = MessageTypeInvalid
		return baseMessage, err
	}

	return baseMessage, nil
}

func unmarshalMessage[T any](baseMessage BaseMessage, msgType MessageType) (T, error) {

	var message T
	if baseMessage.Type != msgType {
		log.Printf("Protocol violation: Expected message type %s, got %s", msgType, baseMessage.Type)
		return message, errors.New("protocol violation")
	}

	err := json.Unmarshal(baseMessage.rawMessage, &message)
	if err != nil {
		log.Printf("Error unmarshalling to %T: %s", message, err)
		return message, err
	}

	err = validate.Struct(message)
	if err != nil {
		log.Printf("Error validating %T: %s", message, err)
		return message, err
	}

	return message, nil
}
