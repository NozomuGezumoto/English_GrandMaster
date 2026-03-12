import { Stack } from 'expo-router';

export default function StudyCardsLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="create" />
      <Stack.Screen name="list" />
      <Stack.Screen name="[id]" />
      <Stack.Screen name="review" />
    </Stack>
  );
}
