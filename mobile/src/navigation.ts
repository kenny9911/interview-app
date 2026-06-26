// Parameterized stack contract (docs/15-decisions.md D8). Params carry the ids
// the production flow needs so screens can fetch the right session/report.
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { Mode, Persona, Style } from './api';

export type RootStackParamList = {
  Welcome: undefined;
  SignIn: undefined;
  SignUp: undefined;
  Home: undefined;
  ChooseMode: { inviteToken?: string } | undefined;
  Setup: { mode: Mode };
  Consent: { configId: string };
  Live: { sessionId: string };
  Analyzing: { sessionId: string };
  Results: { sessionId: string };
  Transcript: { sessionId: string };
  History: undefined;
  DataPrivacy: undefined;
  Plans: undefined;
  Payment: undefined;
  LiveTest: undefined;
};

export type ScreenName = keyof RootStackParamList;
export type { Mode, Persona, Style };

// Typed navigation hook used by every screen: const nav = useNav(); nav.navigate('Home')
export const useNav = () => useNavigation<NativeStackNavigationProp<RootStackParamList>>();

// Typed route params: const { sessionId } = useRouteParams<'Live'>();
export function useRouteParams<T extends ScreenName>(): RootStackParamList[T] {
  return useRoute<RouteProp<RootStackParamList, T>>().params as RootStackParamList[T];
}
