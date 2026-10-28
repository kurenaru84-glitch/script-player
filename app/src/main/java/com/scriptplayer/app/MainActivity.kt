package com.scriptplayer.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.lifecycle.viewmodel.compose.viewModel
import com.scriptplayer.app.player.PlayerViewModel
import com.scriptplayer.app.ui.ScriptPlayerScreen
import com.scriptplayer.app.ui.theme.ScriptPlayerTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            ScriptPlayerTheme {
                val vm: PlayerViewModel = viewModel()
                ScriptPlayerScreen(viewModel = vm)
            }
        }
    }
}
