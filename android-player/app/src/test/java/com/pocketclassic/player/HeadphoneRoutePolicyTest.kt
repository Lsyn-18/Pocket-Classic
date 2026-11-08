package com.pocketclassic.player

import android.media.AudioDeviceInfo
import org.junit.Assert.*
import org.junit.Test

class HeadphoneRoutePolicyTest {
    @Test fun wiredHeadphonesAndHeadsetsAreDetected() {
        for (type in listOf(AudioDeviceInfo.TYPE_WIRED_HEADSET,AudioDeviceInfo.TYPE_WIRED_HEADPHONES)) assertEquals("wired",HeadphoneRoutePolicy.kind(listOf(type)))
    }
    @Test fun usbHeadsetsAndAudioAdaptersAreDetected() {
        for (type in listOf(AudioDeviceInfo.TYPE_USB_HEADSET,AudioDeviceInfo.TYPE_USB_DEVICE)) assertEquals("usb",HeadphoneRoutePolicy.kind(listOf(type)))
    }
    @Test fun classicBluetoothBleHeadsetsAndHearingAidsAreDetected() {
        for (type in listOf(AudioDeviceInfo.TYPE_BLUETOOTH_A2DP,AudioDeviceInfo.TYPE_BLUETOOTH_SCO,AudioDeviceInfo.TYPE_BLE_HEADSET,AudioDeviceInfo.TYPE_HEARING_AID)) assertEquals("bluetooth",HeadphoneRoutePolicy.kind(listOf(type)))
    }
    @Test fun builtInSpeakersHdmiAndExplicitBleSpeakersAreExcluded() {
        assertEquals("none",HeadphoneRoutePolicy.kind(emptyList()))
        assertEquals("none",HeadphoneRoutePolicy.kind(listOf(AudioDeviceInfo.TYPE_BUILTIN_SPEAKER,AudioDeviceInfo.TYPE_BUILTIN_EARPIECE,AudioDeviceInfo.TYPE_HDMI,AudioDeviceInfo.TYPE_BLE_SPEAKER)))
    }
    @Test fun anotherConnectedHeadphoneKeepsTheVisualPlugPresent() {
        assertEquals("wired",HeadphoneRoutePolicy.kind(listOf(3,8)))
        assertEquals("usb",HeadphoneRoutePolicy.kind(listOf(11,8)))
        assertEquals("bluetooth",HeadphoneRoutePolicy.kind(listOf(8)))
    }
}
