package com.lyricflow.app.modules

import com.lyricflow.app.startup.StartupPreloader
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class StartupModule : Module() {
    override fun definition() = ModuleDefinition {
        Name("Startup")

        // Called from JS once during App.tsx initialize().
        // Blocks the background thread until the preloader finishes (usually < 5ms).
        AsyncFunction("getPreloadedData") {
            StartupPreloader.waitForResult()
        }
    }
}
