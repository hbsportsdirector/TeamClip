# Vendrade binärer

## ffmpeg-kit-full-gpl.aar

- **SHA-256:** `87E37384EF5F8755D816212890775BA94D493A70D2EFF4615A8D59780AC1FC5E`
- **Storlek:** 59 625 260 byte
- **Källa:** https://github.com/NooruddinLakhani/ffmpeg-kit-full-gpl/releases/download/v1.0.0/ffmpeg-kit-full-gpl.aar
- **Nedladdad:** 2026-07-14 av användaren (godkänt förtroendebeslut, se konversation)
- **Innehåll:** FFmpegKit 6.0 full-gpl för Android (arm64-v8a, armeabi-v7a, x86, x86_64),
  inkl. libx264 – därav GPL. Officiella binärer drogs tillbaka när ffmpeg-kit-projektet
  pensionerades 2025; detta är community-rehostningen som refereras i
  https://medium.com/hackernoon/resolved-ffmpegkit-retirement-issue-in-react-native-a-complete-guide-0f54b113b390

**Verifiera:** `Get-FileHash vendor\ffmpeg-kit-full-gpl.aar -Algorithm SHA256`

**OBS licens:** full-gpl gör att appbygget innehåller GPL-kod. Oproblematiskt under
intern testning; inför App Store-distribution måste detta ses över (byt till
LGPL-variant + mediacodec/mpeg4-encoder, eller acceptera GPL-villkoren för appen).
