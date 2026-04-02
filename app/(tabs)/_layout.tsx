import { Tabs } from 'expo-router';
import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS } from '../../lib/theme';

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const bottom = Platform.OS === 'web' ? 8 : insets.bottom;

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: COLORS.gold,
        tabBarInactiveTintColor: COLORS.muted,
        headerShown: false,
        tabBarShowLabel: true,
        tabBarStyle: {
          borderTopWidth: 1,
          borderTopColor: COLORS.border,
          backgroundColor: COLORS.surface,
          height: 75 + bottom,
          paddingBottom: bottom + 10,
          paddingTop: 1,
        },
        tabBarLabelStyle: {
          fontSize: 17,
          fontWeight: '600',
          marginBottom: 6,
          fontFamily: Platform.select({ ios: 'Times New Roman', android: 'serif', default: 'Georgia' }),
        },
      }}
    >
      <Tabs.Screen
        name="battle"
        options={{
          title: 'Battle',
          tabBarIcon: () => null,
        }}
      />
      <Tabs.Screen
        name="study"
        options={{
          title: 'Study',
          tabBarIcon: () => null,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: () => null,
        }}
      />
    </Tabs>
  );
}

