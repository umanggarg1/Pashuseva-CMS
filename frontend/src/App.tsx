import { useEffect, useState } from 'react';
import { Routes, Route, Outlet } from 'react-router-dom';
import Home from './pages/Home';
import Login from './pages/Login';
import Signup from './pages/Signup';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import Employees from './pages/Employees';
import Reports from './pages/Reports';
import ChangePassword from './pages/ChangePassword';
import Customers from './pages/Customers';
import CustomerDetail from './pages/CustomerDetail';
import Products from './pages/Products';
import ProductDetail from './pages/ProductDetail';
import Categories from './pages/Categories';
import Orders from './pages/Orders';
import CreateOrder from './pages/CreateOrder';
import OrderDetail from './pages/OrderDetail';
import Trash from './pages/Trash';
import StaticInfoPage from './pages/StaticInfoPage';
import Sidebar from './components/Sidebar';
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import PageContainer from './components/PageContainer';
import RequireAuth from './components/RequireAuth';
import RequireRole from './components/RequireRole';
import RequirePermission from './components/RequirePermission';
import GlobalSearch from './components/GlobalSearch';

function AppShell() {
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen(true);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <div className="min-h-screen flex bg-background">
      <Sidebar />
      {/* min-w-0 is load-bearing: a flex item's default min-width is `auto`, so without
          this, any unbreakable-width content anywhere on any page (a long order number,
          a wide table, a crammed filter row) stops this column from shrinking and pushes
          the whole app wider than the viewport instead of wrapping/scrolling internally. */}
      <div className="min-w-0 flex-1">
        <Navbar onOpenSearch={() => setSearchOpen(true)} />
        <PageContainer>
          <Outlet />
        </PageContainer>
        <Footer />
      </div>
      <GlobalSearch open={searchOpen} onOpenChange={setSearchOpen} />
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/about" element={<StaticInfoPage title="About Us" />} />
      <Route path="/contact" element={<StaticInfoPage title="Contact Us" />} />
      <Route path="/privacy-policy" element={<StaticInfoPage title="Privacy Policy" />} />
      <Route path="/terms-conditions" element={<StaticInfoPage title="Terms & Conditions" />} />

      <Route element={<RequireAuth />}>
        <Route element={<AppShell />}>
          <Route path="/" element={<Home />} />
          <Route path="/change-password" element={<ChangePassword />} />
          <Route path="/customers" element={<Customers />} />
          <Route path="/customers/:id" element={<CustomerDetail />} />
          <Route path="/products" element={<Products />} />
          <Route path="/products/:id" element={<ProductDetail />} />
          <Route path="/orders" element={<Orders />} />
          <Route path="/orders/new" element={<CreateOrder />} />
          <Route path="/orders/:orderNumber" element={<OrderDetail />} />
          <Route element={<RequireRole roles={['ADMIN', 'MANAGER']} />}>
            <Route path="/employees" element={<Employees />} />
            <Route path="/categories" element={<Categories />} />
          </Route>
          <Route element={<RequirePermission permission="report:view" />}>
            <Route path="/reports" element={<Reports />} />
          </Route>
          {/* Trash is Admin-only, no exceptions (Phase 3 addendum). */}
          <Route element={<RequireRole roles={['ADMIN']} />}>
            <Route path="/trash" element={<Trash />} />
          </Route>
        </Route>
      </Route>
    </Routes>
  );
}
