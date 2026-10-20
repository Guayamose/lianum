# Build and test on an Android phone

<p><a href="../README.md"><img src="assets/lianum.svg" width="110" alt="Lianum"></a></p>

[Documentation](README.md) · [Architecture](ARCHITECTURE.md) · [Validation](VALIDATION.md)

A standalone local APK contains the JavaScript bundle and can connect to the configured public API without Metro. USB is needed for installation and device diagnostics, not for keeping the cloud engine running. See the [mobile guide](../apps/mobile/README.md) for build prerequisites.

## Install while preserving app data

Enable USB debugging in Android developer settings, connect the phone and accept the computer's debugging prompt. Use the same ADB binary and server throughout the session:

```sh
adb devices -l
# Replace PHONE_SERIAL with the authorized device shown above.
adb -s PHONE_SERIAL install -r apps/mobile/android/app/build/outputs/apk/release/app-release.apk
adb -s PHONE_SERIAL shell monkey -p org.lianum.wallet -c android.intent.category.LAUNCHER 1
```

Select the intended device explicitly when more than one is listed. `unauthorized` requires confirmation on the phone; `offline` needs the connection resolved. Keep the existing signing identity when updating an installation. Do not uninstall the wallet or clear its data to solve an installation issue: its protected custody and saved state matter.

The user completes biometric prompts on the physical device. ADB cannot substitute for financial approval. Record the APK hash, installed package and actual operation result together when collecting evidence.

## Local laboratory connections

A local operator can expose its pinned TLS endpoint on loopback and use an ADB reverse rule. This preserves the endpoint's certificate and trust settings:

```sh
adb -s PHONE_SERIAL reverse --list
adb -s PHONE_SERIAL reverse --no-rebind tcp:9443 tcp:9443
# DeFi uses its own endpoint when that laboratory profile requires it.
adb -s PHONE_SERIAL reverse --no-rebind tcp:9444 tcp:9444
```

Check an existing rule before using it; do not overwrite another session's routing. Import the operator's **public paired connection profile** into the matching mobile screen. Never import its private `operator.json` or copy custody secrets to the clipboard.

When finished, remove only rules created by this session and still pointing to the same endpoint:

```sh
adb -s PHONE_SERIAL reverse --remove tcp:9443
adb -s PHONE_SERIAL reverse --remove tcp:9444
```

Removing a USB tunnel does not reopen or reset the engine. Start a new financial laboratory only through its explicit profile and state requirements in [the workflow guide](WORKFLOW.md).

## WSL

Windows ADB can manage a phone connected to Windows without attaching it to WSL through USBIP. Use one known Google Platform Tools installation and, if needed, a dedicated server port such as `5038`; pass the same port to every command. The reverse connection terminates on the ADB host, so confirm that the WSL operator is reachable from Windows before importing its public profile. A Linux ADB installation is an alternative only when it actually lists the authorized phone.

Record the installed release and operation evidence together. The [validation guide](VALIDATION.md) distinguishes successful installation, physical approval and confirmed financial results.
