package com.pocketclassic.player

import android.media.AudioDeviceInfo

object HeadphoneRoutePolicy {
    fun kind(types: Collection<Int>): String = when {
        types.any { it == AudioDeviceInfo.TYPE_WIRED_HEADSET || it == AudioDeviceInfo.TYPE_WIRED_HEADPHONES } -> "wired"
        types.any { it == AudioDeviceInfo.TYPE_USB_HEADSET || it == AudioDeviceInfo.TYPE_USB_DEVICE } -> "usb"
        types.any { it == AudioDeviceInfo.TYPE_BLUETOOTH_A2DP || it == AudioDeviceInfo.TYPE_BLUETOOTH_SCO || it == AudioDeviceInfo.TYPE_BLE_HEADSET || it == AudioDeviceInfo.TYPE_HEARING_AID } -> "bluetooth"
        else -> "none"
    }
}
