package main

import (
	"encoding/json"
	"log"
)

// Define custom types and constants for the Type field
type MessageType string

const (
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
)

// Messages
type RegisterRoomMessage struct {
	Type       MessageType `json:"type" validate:"required"`
	RoomConfig RoomConfig  `json:"roomConfig" validate:"required"`
}

type RoomConfig struct {
	BBBUserName string                 `json:"bbb_user_name" validate:"required"`
	BBBUserID   string                 `json:"bbb_user_id" validate:"required"`
	Layouts     map[string]interface{} `json:"layouts" validate:"required"`
}

// creates a PairingPIN message and marshals it to JSON
func createPairingPINMessage(pin int) ([]byte, error) {

	message := PairingPINMessage{
		Type: MessageTypePairingPIN,
		PIN:  pin,
	}

	messageJSON, err := json.Marshal(message)
	if err != nil {
		log.Println("Error marshalling RoomPINMessage:", err)
		return nil, err
	}
	return messageJSON, nil
}

type PairingPINUserInputMessage struct {
	Type MessageType `json:"type" validate:"required"`
	PIN  int         `json:"PIN" validate:"required,numeric,min=100000,max=999999"`
}

type PairingPINMessage struct {
	Type MessageType `json:"type" validate:"required"`
	PIN  int         `json:"PIN" validate:"required"`
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
	Status bool        `json:"status" validate:"required"`
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
