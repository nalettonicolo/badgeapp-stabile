import 'react-native-gesture-handler';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import * as Updates from 'expo-updates';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from './context/AuthContext';
import { colors } from './lib/theme';
import AdminScreen from './screens/AdminScreen';
import LoginScreen from './screens/LoginScreen';
import PunchScreen from './screens/PunchScreen';
import RequestsScreen from './screens/RequestsScreen';

export type RootStackParamList = {
  Login: undefined;
  Punch: undefined;
  Admin: undefined;
  Requests: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

function RootNavigator() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <View style={styles.boot}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {user ? (
        <>
          <Stack.Screen name="Punch" component={PunchScreen} />
          <Stack.Screen name="Admin" component={AdminScreen} />
          <Stack.Screen name="Requests" component={RequestsScreen} />
        </>
      ) : (
        <Stack.Screen name="Login" component={LoginScreen} />
      )}
    </Stack.Navigator>
  );
}

function OtaUpdatesOnLaunch() {
  useEffect(() => {
    async function fetchAndReload() {
      if (__DEV__ || !Updates.isEnabled) return;
      try {
        const check = await Updates.checkForUpdateAsync();
        if (check.isAvailable) {
          await Updates.fetchUpdateAsync();
          await Updates.reloadAsync();
        }
      } catch {
        /* ignore: rete assente o progetto senza EAS configurato */
      }
    }
    void fetchAndReload();
  }, []);
  return null;
}

export default function App() {
  return (
    <SafeAreaProvider>
      <OtaUpdatesOnLaunch />
      <AuthProvider>
        <NavigationContainer>
          <RootNavigator />
        </NavigationContainer>
        <StatusBar style="dark" />
      </AuthProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  boot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg,
  },
});
