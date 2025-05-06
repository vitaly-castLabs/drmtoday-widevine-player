Minimal MSE/EME player using castLabs DRMtoday as a Widevine backend. Requires a DRMtoday account, won't work with Safari or any browser on iOS (as any browser on iOS is a wrapper around Safari).

High quality (480p) stream requires Widevine L1 for playback (can be checked [here](https://vitaly-castlabs.github.io/bt/)), which is usually the case for Android devices, but not desktops.

## Packaging scripts
Low quality (160p) video was created with the following script (requires `ffmpeg` and `Shaka Packager`), the actual encryption key is hidden on purpose:
```bash
ffmpeg -ss 1 -i meridian.mp4 -vf "scale=-2:160,drawtext=text='160p %{eif\:mod(t/60\,60)\:d\:2}\:%{eif\:mod(t\,60)\:d\:2}\.%{eif\:100*mod(t\,1)\:d\:2}':fontcolor=white:fontsize=11:x=w-tw-10:y=h-th-10" -t 60 -c:v libx264 -profile:v high -x264-params scenecut=0:open_gop=0:min-keyint=180000/1001:keyint=180000/1001 -crf 22 -f mp4 -movflags frag_keyframe+empty_moov+default_base_moof -y meridian-160.mp4 && \
packager in=meridian-160.mp4,stream=video,output=meridian-160-encr.mp4,drm_label=VIDEO --protection_scheme cbcs --enable_raw_key_encryption --protection_systems Widevine --segment_duration 3 --fragment_duration 3 --keys label=VIDEO:key_id=00000000000000000000000000000160:key=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx:iv=d5fbd6b82ed93e4ef98ae40931ee33b7 --clear_lead 0
```

High quality (480p):
```bash
ffmpeg -ss 1 -i meridian.mp4 -vf "scale=-2:480,drawtext=text='480p %{eif\:mod(t/60\,60)\:d\:2}\:%{eif\:mod(t\,60)\:d\:2}\.%{eif\:100*mod(t\,1)\:d\:2}':fontcolor=white:fontsize=20:x=w-tw-10:y=h-th-10" -t 60 -c:v libx264 -profile:v high -x264-params scenecut=0:open_gop=0:min-keyint=180000/1001:keyint=180000/1001 -crf 22 -f mp4 -movflags frag_keyframe+empty_moov+default_base_moof -y meridian-480.mp4 && \
packager in=meridian-480.mp4,stream=video,output=meridian-480-encr.mp4,drm_label=VIDEO --protection_scheme cbcs --enable_raw_key_encryption --protection_systems Widevine --segment_duration 3 --fragment_duration 3 --keys label=VIDEO:key_id=00000000000000000000000000000480:key=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx:iv=d5fbd6b82ed93e4ef98ae40931ee33b7 --clear_lead 0
```
High quality with AES-CTR encryption (for Widevine L1 on Windows):
```bash
packager in=meridian-480.mp4,stream=video,output=meridian-480-encr-cenc.mp4,drm_label=VIDEO --protection_scheme cenc --enable_raw_key_encryption --protection_systems Widevine --segment_duration 3 --fragment_duration 3 --keys label=VIDEO:key_id=00000000000000000000000000000480:key=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx --clear_lead 0
```

The original media can be downladed from [Netflix Open Content](https://opencontent.netflix.com/#h.fzfk5hndrb9w)
