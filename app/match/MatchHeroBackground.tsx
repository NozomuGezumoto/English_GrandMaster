import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { View, type ImageSourcePropType } from 'react-native';
import { ThemeProvider, DarkTheme, type Theme } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { TowerScreenBackground } from '../components/tower/TowerScreenBackground';

/** Stack の Screen が theme.colors.background で全面塗りするため、画像背景が透けるよう透明にする */
const MATCH_STACK_THEME: Theme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: 'transparent',
    card: 'transparent',
  },
};

type Ctx = {
  setHeroBackground: (src: ImageSourcePropType | undefined) => void;
};

const MatchHeroBgContext = createContext<Ctx | null>(null);

export function useMatchHeroBackgroundSetter(): Ctx['setHeroBackground'] | undefined {
  return useContext(MatchHeroBgContext)?.setHeroBackground;
}

export function MatchStackWithHeroBackground() {
  const [hero, setHero] = useState<ImageSourcePropType | undefined>(undefined);
  const setHeroBackground = useCallback((src: ImageSourcePropType | undefined) => {
    setHero(src);
  }, []);
  const value = useMemo(() => ({ setHeroBackground }), [setHeroBackground]);

  return (
    <MatchHeroBgContext.Provider value={value}>
      <TowerScreenBackground style={{ flex: 1, width: '100%' }} backgroundSource={hero}>
        <ThemeProvider value={MATCH_STACK_THEME}>
          <View style={{ flex: 1, width: '100%', minHeight: 0 }}>
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: 'transparent' },
              }}
            />
          </View>
        </ThemeProvider>
      </TowerScreenBackground>
    </MatchHeroBgContext.Provider>
  );
}
