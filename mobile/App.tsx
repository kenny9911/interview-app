import React from 'react';
import { View, ActivityIndicator } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFonts } from 'expo-font';
import { BricolageGrotesque_700Bold } from '@expo-google-fonts/bricolage-grotesque';
import {
  HankenGrotesk_400Regular,
  HankenGrotesk_500Medium,
  HankenGrotesk_600SemiBold,
  HankenGrotesk_700Bold,
  HankenGrotesk_800ExtraBold,
} from '@expo-google-fonts/hanken-grotesk';

import { colors } from './src/theme';
import { RootStackParamList } from './src/navigation';

import WelcomeScreen from './src/screens/WelcomeScreen';
import SignInScreen from './src/screens/SignInScreen';
import SignUpScreen from './src/screens/SignUpScreen';
import HomeScreen from './src/screens/HomeScreen';
import ChooseModeScreen from './src/screens/ChooseModeScreen';
import SetupScreen from './src/screens/SetupScreen';
import LiveScreen from './src/screens/LiveScreen';
import ResultsScreen from './src/screens/ResultsScreen';
import PlansScreen from './src/screens/PlansScreen';
import PaymentScreen from './src/screens/PaymentScreen';
import LiveTestScreen from './src/screens/LiveTestScreen';
import ConsentScreen from './src/screens/ConsentScreen';
import AnalyzingScreen from './src/screens/AnalyzingScreen';
import TranscriptScreen from './src/screens/TranscriptScreen';
import HistoryScreen from './src/screens/HistoryScreen';
import DataPrivacyScreen from './src/screens/DataPrivacyScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App() {
  const [loaded] = useFonts({
    BricolageGrotesque_700Bold,
    HankenGrotesk_400Regular,
    HankenGrotesk_500Medium,
    HankenGrotesk_600SemiBold,
    HankenGrotesk_700Bold,
    HankenGrotesk_800ExtraBold,
  });

  if (!loaded) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bone, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.persimmon} />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <Stack.Navigator
          initialRouteName="Welcome"
          screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bone } }}
        >
          <Stack.Screen name="Welcome" component={WelcomeScreen} />
          <Stack.Screen name="SignIn" component={SignInScreen} />
          <Stack.Screen name="SignUp" component={SignUpScreen} />
          <Stack.Screen name="Home" component={HomeScreen} />
          <Stack.Screen name="ChooseMode" component={ChooseModeScreen} />
          <Stack.Screen name="Setup" component={SetupScreen} />
          <Stack.Screen name="Consent" component={ConsentScreen} />
          <Stack.Screen name="Live" component={LiveScreen} options={{ animation: 'fade' }} />
          <Stack.Screen name="Analyzing" component={AnalyzingScreen} options={{ animation: 'fade' }} />
          <Stack.Screen name="Results" component={ResultsScreen} />
          <Stack.Screen name="Transcript" component={TranscriptScreen} />
          <Stack.Screen name="History" component={HistoryScreen} />
          <Stack.Screen name="DataPrivacy" component={DataPrivacyScreen} />
          <Stack.Screen name="Plans" component={PlansScreen} />
          <Stack.Screen name="Payment" component={PaymentScreen} />
          <Stack.Screen name="LiveTest" component={LiveTestScreen} />
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
