import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import { Toaster as SonnerToaster } from 'sonner';
import Layout from '@/components/Layout';
import Home from '@/pages/Home';
import Collections from '@/pages/Collections';
import CollectionDetail from '@/pages/CollectionDetail';
import DeckBuilder from '@/pages/DeckBuilder';
import StudySession from '@/pages/StudySession';
import SharedDeck from '@/pages/SharedDeck';
import QuizMaster from '@/pages/QuizMaster';
import DeckStats from '@/pages/DeckStats';
import DeckSettings from '@/pages/DeckSettings';
import AdminExtras from '@/pages/AdminExtras';
import Profile from '@/pages/Profile';
import CollectionStudy from '@/pages/CollectionStudy';
import SharedCollection from '@/pages/SharedCollection';

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin } = useAuth();

  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-primary rounded-full animate-spin"></div>
      </div>
    );
  }

  if (authError) {
    if (authError.type === 'user_not_registered') return <UserNotRegisteredError />;
    else if (authError.type === 'auth_required') { navigateToLogin(); return null; }
  }

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Home />} />
        <Route path="/collections" element={<Collections />} />
        <Route path="/collections/:collectionId" element={<CollectionDetail />} />
        <Route path="/deck/:deckId" element={<DeckBuilder />} />
        <Route path="/study/:deckId" element={<StudySession />} />
        <Route path="/quiz" element={<QuizMaster />} />
        <Route path="/stats/:deckId" element={<DeckStats />} />
        <Route path="/settings/:deckId" element={<DeckSettings />} />
        <Route path="/admin/extras" element={<AdminExtras />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/collections/:collectionId/study" element={<CollectionStudy />} />
      </Route>
      <Route path="/shared/:token" element={<SharedDeck />} />
      <Route path="/shared-collection/:token" element={<SharedCollection />} />
      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};

function App() {
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <AuthenticatedApp />
        </Router>
        <Toaster />
        <SonnerToaster position="bottom-right" />
      </QueryClientProvider>
    </AuthProvider>
  );
}

export default App;