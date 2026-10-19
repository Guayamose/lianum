# VoiceOrbs · Particles Orb

Source: https://github.com/amunozdev/voiceorbs

Component preview: https://voiceorbs.vercel.app/orbs/particles-orb

Pinned commit: `8b2799917734f52c9293a489e08982ca5b0187e9`.

Copyright 2026 Alexis Munoz. MIT license retained in `LICENSE`.

The React canvas component, color utilities, state blending and web animator come from `src/registry` at that commit. The 720-particle rendering body has been factored into `lib/particles-renderer.ts` so web and native use the same projection, motion, palette buckets and state transitions. Web retains the upstream canvas host. The native adapter in `features/agent/AgentPresence.tsx` draws its paths with Shopify Skia at up to 30 frames per second, using one shared picture instead of hundreds of React elements per frame.

Local changes: freeze message miniature indicators and disabled orbs, animate the Home orb only while its screen is focused, initialize page-visibility tracking immediately, integrate the Lianum palette, and expose native accessibility and reduced-motion handling. No microphone, audio hook, sound cue or provider integration is included.
