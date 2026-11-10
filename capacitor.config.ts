import type { CapacitorConfig } from "@capacitor/cli";

/**
 * appId is the Android applicationId / package name.
 * It should match where the source is hosted (F-Droid convention), e.g.
 *   GitHub  github.com/<user>/lianbo  -> io.github.<user>.lianbo
 *   Codeberg codeberg.org/<user>/lianbo -> org.codeberg.<user>.lianbo
 * To change it later, see "更換 appId" in README.md (scripts/set-app-id.sh does it in one step).
 * Once published on F-Droid, never change it again.
 */
const config: CapacitorConfig = {
  appId: "io.github.chenluke1975.lianbo",
  appName: "連撥",
  webDir: "dist",
  android: {
    // No remote content; everything is served from the APK.
    allowMixedContent: false,
    webContentsDebuggingEnabled: false,
  },
  server: {
    androidScheme: "https",
  },
  plugins: {
    CapacitorHttp: { enabled: false },
    CapacitorCookies: { enabled: false },
  },
};

export default config;
