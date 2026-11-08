import { Redirect } from "expo-router";

// plotra://sign-in, where the browser hands the sign-in back (lib/sign-in.ts).
// The browser sheet takes the code itself; if the link opens the app as well
// (Android does), there's nothing to show here.
export default function SignInReturn() {
  return <Redirect href="/" />;
}
