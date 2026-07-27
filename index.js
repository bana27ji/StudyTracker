import 'react-native-gesture-handler'; // यह लाइन सबसे ऊपर होना बहुत ज़रूरी है, वरना ऐप क्रैश हो जाएगा
import { registerRootComponent } from 'expo';
import App from './App';

// यह Android सिस्टम को बताता है कि ऐप को 'App.js' से शुरू करना है
registerRootComponent(App);
