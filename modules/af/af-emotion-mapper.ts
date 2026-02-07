export type EmotionMapping = {
  primary_emotion: string;
  secondary_emotions: string[];
  intensity: number;
  valence: number;
};

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

export function clampIntensity(value: number): number {
  return clamp(value, 0, 1);
}

export function clampValence(value: number): number {
  return clamp(value, -1, 1);
}

function normalize01(value: number): number {
  return clamp(value, 0, 1);
}

export function prosodyToEmotionMapping(prosody: {
  pitch_mean: number;
  pitch_variance: number;
  energy_mean: number;
}): EmotionMapping {
  const pitchMean01 = normalize01(prosody.pitch_mean);
  const pitchVar01 = normalize01(prosody.pitch_variance);
  const energy01 = normalize01(prosody.energy_mean);

  const intensity = clampIntensity(0.65 * energy01 + 0.35 * pitchVar01);
  const valence = clampValence((pitchMean01 - 0.5) * 1.2 + (energy01 - 0.5) * 0.8);

  let primary_emotion: string;

  if (valence >= 0 && intensity >= 0.5) primary_emotion = 'joy';
  else if (valence >= 0 && intensity < 0.5) primary_emotion = 'calm';
  else if (valence < 0 && intensity >= 0.5) primary_emotion = 'anger';
  else primary_emotion = 'sadness';

  const secondary_emotions: string[] = [];

  if (intensity >= 0.75) secondary_emotions.push('arousal');
  if (intensity <= 0.25) secondary_emotions.push('low_arousal');
  if (valence >= 0.6) secondary_emotions.push('optimism');
  if (valence <= -0.6) secondary_emotions.push('distress');

  return {
    primary_emotion,
    secondary_emotions,
    intensity,
    valence,
  };
}
