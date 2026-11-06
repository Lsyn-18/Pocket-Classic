package com.pocketclassic.player

import android.content.Context
import android.content.ContextWrapper
import android.content.SharedPreferences
import android.security.NetworkSecurityPolicy
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import java.util.UUID

@RunWith(AndroidJUnit4::class)
class MusicSessionStoreTest {
    @Test fun sessionSurvivesRecreationEncryptedAndLogoutClearsIt() {
        val target=InstrumentationRegistry.getInstrumentation().targetContext
        val name="session-test-"+UUID.randomUUID().toString()
        val context=object: ContextWrapper(target) {
            override fun getSharedPreferences(unused: String,mode: Int): SharedPreferences=target.getSharedPreferences(name,mode)
        }
        val prefs=context.getSharedPreferences("",Context.MODE_PRIVATE)
        try {
            prefs.edit().putString("url","http://192.168.1.1:17864").putString("access","old-test-token").putString("iv","old-test-iv").putBoolean("dark",true).commit()
            val store=MusicSessionStore(context)
            assertNull(prefs.getString("access",null));assertNull(prefs.getString("url",null));assertTrue(store.dark)
            val session=MusicSession("MUSIC_U=synthetic-only-test-cookie",12345,"Test nickname")
            store.save(session)
            assertEquals(session,MusicSessionStore(context).read())
            val persisted=prefs.all.toString()
            assertFalse(persisted.contains(session.cookie));assertFalse(persisted.contains(session.nickname))
            store.clear();assertNull(MusicSessionStore(context).read());assertTrue(store.dark)
        } finally { prefs.edit().clear().commit() }
    }
    @Test fun desktopHttpGatewaysAreNotPermitted() {
        val policy=NetworkSecurityPolicy.getInstance()
        for(host in listOf("localhost","127.0.0.1","10.0.2.2","192.168.1.1","example.com"))assertFalse(policy.isCleartextTrafficPermitted(host))
        assertTrue(policy.isCleartextTrafficPermitted("m801.music.126.net"))
    }
}
