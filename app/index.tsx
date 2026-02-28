import { Redirect } from 'expo-router';

export default function Index() {
  // タブナビゲーションにリダイレクト
  return <Redirect href="/(tabs)/battle" />;
}
