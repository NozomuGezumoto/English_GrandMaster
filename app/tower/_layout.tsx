import { Stack } from 'expo-router';

export default function TowerLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="guardians" />
      <Stack.Screen name="guardian/[levelCode]" />
      <Stack.Screen name="[towerType]" />
    </Stack>
  );
}
