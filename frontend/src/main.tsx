import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { init } from '@getalby/bitcoin-connect-react'

// Initialize Bitcoin Connect for better NWC support
init({
  appName: 'Nostr Delivery',
  providerConfig: {
    nwc: {
      authorizationUrlOptions: {
        requestMethods: [
          'pay_invoice',
          'make_invoice',
          'get_balance',
          'get_info',
          'lookup_invoice',
          'list_transactions'
        ],
      },
    },
  },
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
