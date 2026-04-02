import { Stack } from 'expo-router';

export default function TowerTypeLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="[levelCode]" />
    </Stack>
  );
}
