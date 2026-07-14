import { useState } from "react";
import { useCameraPermissions, useMicrophonePermissions } from "expo-camera";

export function useAVPermissions() {
  const [camPerm, requestCamPerm] = useCameraPermissions();
  const [micPerm, requestMicPerm] = useMicrophonePermissions();
  const [denied, setDenied] = useState(false);

  const ensure = async () => {
    let cam = camPerm;
    let mic = micPerm;
    if (!cam?.granted) cam = await requestCamPerm();
    if (!mic?.granted) mic = await requestMicPerm();
    const ok = !!(cam?.granted && mic?.granted);
    setDenied(!ok);
    return ok;
  };

  return { ensure, denied };
}
