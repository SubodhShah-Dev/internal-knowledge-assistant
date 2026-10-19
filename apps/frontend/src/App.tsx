import { useState } from 'react';
import { clearToken, getToken, setToken } from './api/client';
import AssistantPage from './pages/AssistantPage';
import LoginPage from './pages/LoginPage';

const EMAIL_KEY = 'email';

function App() {
  const [token, setTokenState] = useState(getToken());

  if (!token) {
    return (
      <LoginPage
        onAuthenticated={(nextToken, email) => {
          setToken(nextToken);
          localStorage.setItem(EMAIL_KEY, email);
          setTokenState(nextToken);
        }}
      />
    );
  }

  return (
    <AssistantPage
      email={localStorage.getItem(EMAIL_KEY) ?? 'logged-in user'}
      onLoggedOut={() => {
        clearToken();
        localStorage.removeItem(EMAIL_KEY);
        setTokenState('');
      }}
    />
  );
}

export default App;
