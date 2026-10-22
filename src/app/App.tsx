import { Suspense, lazy } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./AuthProvider";
import { SettingsProvider } from "./SettingsProvider";
import { ToastProvider } from "./ToastProvider";
import { PublicLayout } from "@/components/layout/PublicLayout";
import { HomePage } from "@/features/home/HomePage";
import { NotFoundPage } from "@/pages/NotFoundPage";
import { DrawsPage } from "@/pages/public/DrawsPage";
import { DrawDetailPage } from "@/pages/public/DrawDetailPage";
import { WinnersPage } from "@/pages/public/WinnersPage";
import { BookTicketsPage } from "@/pages/public/BookTicketsPage";
import { AboutPage } from "@/pages/public/AboutPage";
import { ContactPage } from "@/pages/public/ContactPage";
import { FaqsPage } from "@/pages/public/FaqsPage";
import { LegalPageView } from "@/pages/public/LegalPageView";
import { LoginPage } from "@/pages/public/LoginPage";
import { RegisterPage } from "@/pages/public/RegisterPage";
import { AccountSuspendedPage } from "@/pages/public/AccountSuspendedPage";
import { RequireAuth, RequireAdmin } from "@/routes/guards";
import { ViewAsBanner, ViewAsPage } from "@/features/auth/ViewAs";
import { LoadingBlock } from "@/components/ui";

/**
 * Route table.
 *
 * The public shell (home, draws, winners, auth) loads eagerly — it is the first
 * thing a visitor sees. The authenticated dashboard and the entire admin
 * console are code-split: a customer never downloads the admin bundle, and an
 * administrator does not pay its cost on the marketing pages.
 *
 * Named exports are mapped onto lazy defaults inline, so page modules keep
 * exporting a single clearly-named component rather than a default.
 */

/* ------------------------------------------------------------- dashboard -- */

const DashboardLayout = lazy(() =>
  import("@/pages/dashboard/DashboardLayout").then((m) => ({ default: m.DashboardLayout })),
);
const DashboardOverviewPage = lazy(() =>
  import("@/pages/dashboard/OverviewPage").then((m) => ({ default: m.DashboardOverviewPage })),
);
const WalletPage = lazy(() =>
  import("@/pages/dashboard/WalletPage").then((m) => ({ default: m.WalletPage })),
);
const AddMoneyPage = lazy(() =>
  import("@/pages/dashboard/AddMoneyPage").then((m) => ({ default: m.AddMoneyPage })),
);
const SendMoneyPage = lazy(() =>
  import("@/pages/dashboard/SendMoneyPage").then((m) => ({ default: m.SendMoneyPage })),
);
const MyTicketsPage = lazy(() =>
  import("@/pages/dashboard/MyTicketsPage").then((m) => ({ default: m.MyTicketsPage })),
);
const TicketDetailPage = lazy(() =>
  import("@/pages/dashboard/TicketDetailPage").then((m) => ({ default: m.TicketDetailPage })),
);
const ReferralsPage = lazy(() =>
  import("@/pages/dashboard/ReferralsPage").then((m) => ({ default: m.ReferralsPage })),
);
const SpinPage = lazy(() =>
  import("@/pages/dashboard/SpinPage").then((m) => ({ default: m.SpinPage })),
);
const CouponsPage = lazy(() =>
  import("@/pages/dashboard/CouponsPage").then((m) => ({ default: m.CouponsPage })),
);
const ShopDashboardPage = lazy(() =>
  import("@/pages/shop/ShopDashboardPage").then((m) => ({ default: m.ShopDashboardPage })),
);
const DrawHistoryPage = lazy(() =>
  import("@/pages/dashboard/DrawHistoryPage").then((m) => ({ default: m.DrawHistoryPage })),
);
const NotificationsPage = lazy(() =>
  import("@/pages/dashboard/NotificationsPage").then((m) => ({ default: m.NotificationsPage })),
);
const ProfilePage = lazy(() =>
  import("@/pages/dashboard/ProfilePage").then((m) => ({ default: m.ProfilePage })),
);
const SupportPage = lazy(() =>
  import("@/pages/dashboard/SupportPage").then((m) => ({ default: m.SupportPage })),
);

/* ----------------------------------------------------------------- admin -- */

const AdminLayout = lazy(() =>
  import("@/pages/admin/AdminLayout").then((m) => ({ default: m.AdminLayout })),
);
const AdminOverviewPage = lazy(() =>
  import("@/pages/admin/OverviewPage").then((m) => ({ default: m.AdminOverviewPage })),
);
const AdminProductsPage = lazy(() =>
  import("@/pages/admin/ProductsPage").then((m) => ({ default: m.AdminProductsPage })),
);
const ProductsPage = lazy(() =>
  import("@/pages/public/ProductsPage").then((m) => ({ default: m.ProductsPage })),
);
const DashboardProductsPage = lazy(() =>
  import("@/pages/dashboard/ProductsPage").then((m) => ({ default: m.DashboardProductsPage })),
);
const AdminBannersPage = lazy(() =>
  import("@/pages/admin/BannersPage").then((m) => ({ default: m.AdminBannersPage })),
);
const AdminSplashPage = lazy(() =>
  import("@/pages/admin/SplashPage").then((m) => ({ default: m.AdminSplashPage })),
);
const AdminDrawsPage = lazy(() =>
  import("@/pages/admin/DrawsPage").then((m) => ({ default: m.AdminDrawsPage })),
);
const AdminInventoryPage = lazy(() =>
  import("@/pages/admin/InventoryPage").then((m) => ({ default: m.AdminInventoryPage })),
);
const AdminOrdersPage = lazy(() =>
  import("@/pages/admin/OrdersPage").then((m) => ({ default: m.AdminOrdersPage })),
);
const AdminDepositsPage = lazy(() =>
  import("@/pages/admin/DepositsPage").then((m) => ({ default: m.AdminDepositsPage })),
);
const AdminLedgerPage = lazy(() =>
  import("@/pages/admin/LedgerPage").then((m) => ({ default: m.AdminLedgerPage })),
);
const AdminTransfersPage = lazy(() =>
  import("@/pages/admin/TransfersPage").then((m) => ({ default: m.AdminTransfersPage })),
);
const AdminPaymentQrPage = lazy(() =>
  import("@/pages/admin/PaymentQrPage").then((m) => ({ default: m.AdminPaymentQrPage })),
);
const AdminCustomersPage = lazy(() =>
  import("@/pages/admin/CustomersPage").then((m) => ({ default: m.AdminCustomersPage })),
);
const AdminReferralsPage = lazy(() =>
  import("@/pages/admin/ReferralsPage").then((m) => ({ default: m.AdminReferralsPage })),
);
const AdminSpinPage = lazy(() =>
  import("@/pages/admin/SpinPage").then((m) => ({ default: m.AdminSpinPage })),
);
const AdminRewardsPage = lazy(() =>
  import("@/pages/admin/RewardsPage").then((m) => ({ default: m.AdminRewardsPage })),
);
const AdminWinnersPage = lazy(() =>
  import("@/pages/admin/WinnersPage").then((m) => ({ default: m.AdminWinnersPage })),
);
const AdminAnnouncementsPage = lazy(() =>
  import("@/pages/admin/AnnouncementsPage").then((m) => ({ default: m.AdminAnnouncementsPage })),
);
const AdminReportsPage = lazy(() =>
  import("@/pages/admin/ReportsPage").then((m) => ({ default: m.AdminReportsPage })),
);
const AdminLegalPage = lazy(() =>
  import("@/pages/admin/LegalPage").then((m) => ({ default: m.AdminLegalPage })),
);
const AdminAuditPage = lazy(() =>
  import("@/pages/admin/AuditPage").then((m) => ({ default: m.AdminAuditPage })),
);
const AdminSettingsPage = lazy(() =>
  import("@/pages/admin/SettingsPage").then((m) => ({ default: m.AdminSettingsPage })),
);

export function App() {
  return (
    <BrowserRouter>
      <SettingsProvider>
        <AuthProvider>
          <ToastProvider>
            <Suspense
              fallback={
                <div className="grid min-h-screen place-items-center bg-ivory px-6">
                  <LoadingBlock label="Loading…" />
                </div>
              }
            >
              <ViewAsBanner />
              <Routes>
                <Route path="view-as" element={<ViewAsPage />} />

                {/* ---------------------------------------------------- public */}
                <Route element={<PublicLayout />}>
                  <Route index element={<HomePage />} />
                  <Route path="draws" element={<DrawsPage />} />
                  <Route path="draws/:slug" element={<DrawDetailPage />} />
                  <Route path="winners" element={<WinnersPage />} />
                  <Route path="products" element={<ProductsPage />} />
                  <Route path="book" element={<BookTicketsPage />} />
                  <Route path="about" element={<AboutPage />} />
                  <Route path="contact" element={<ContactPage />} />
                  <Route path="faqs" element={<FaqsPage />} />
                  <Route path="legal/:slug" element={<LegalPageView />} />
                  <Route path="login" element={<LoginPage />} />
                  <Route path="register" element={<RegisterPage />} />
                  <Route path="account-suspended" element={<AccountSuspendedPage />} />
                </Route>

                {/* ------------------------------------------------- customer */}
                <Route element={<RequireAuth />}>
                  <Route element={<PublicLayout />}>
                    <Route path="dashboard" element={<DashboardLayout />}>
                      <Route index element={<DashboardOverviewPage />} />
                      <Route path="wallet" element={<WalletPage />} />
                      <Route path="add-money" element={<AddMoneyPage />} />
                      <Route path="send-money" element={<SendMoneyPage />} />
                      <Route path="products" element={<DashboardProductsPage />} />
                      <Route path="tickets" element={<MyTicketsPage />} />
                      <Route path="tickets/:ticketId" element={<TicketDetailPage />} />
                      <Route path="referrals" element={<ReferralsPage />} />
                      <Route path="spin" element={<SpinPage />} />
                      <Route path="coupons" element={<CouponsPage />} />
                      <Route path="history" element={<DrawHistoryPage />} />
                      <Route path="notifications" element={<NotificationsPage />} />
                      <Route path="profile" element={<ProfilePage />} />
                      <Route path="support" element={<SupportPage />} />
                    </Route>
                    <Route path="shop" element={<ShopDashboardPage />} />
                  </Route>
                </Route>

                {/* ---------------------------------------------------- admin */}
                <Route element={<RequireAdmin />}>
                  <Route path="admin" element={<AdminLayout />}>
                    <Route index element={<AdminOverviewPage />} />
                    <Route path="products" element={<AdminProductsPage />} />
                    <Route path="banners" element={<AdminBannersPage />} />
                    <Route path="splash" element={<AdminSplashPage />} />
                    <Route path="draws" element={<AdminDrawsPage />} />
                    <Route path="inventory" element={<AdminInventoryPage />} />
                    <Route path="orders" element={<AdminOrdersPage />} />
                    <Route path="deposits" element={<AdminDepositsPage />} />
                    <Route path="ledger" element={<AdminLedgerPage />} />
                    <Route path="transfers" element={<AdminTransfersPage />} />
                    <Route path="payment-qr" element={<AdminPaymentQrPage />} />
                    <Route path="customers" element={<AdminCustomersPage />} />
                    <Route path="referrals" element={<AdminReferralsPage />} />
                    <Route path="spin" element={<AdminSpinPage />} />
                    <Route path="rewards" element={<AdminRewardsPage />} />
                    <Route path="winners" element={<AdminWinnersPage />} />
                    <Route path="announcements" element={<AdminAnnouncementsPage />} />
                    <Route path="reports" element={<AdminReportsPage />} />
                    <Route path="legal" element={<AdminLegalPage />} />
                    <Route path="audit" element={<AdminAuditPage />} />
                    <Route path="settings" element={<AdminSettingsPage />} />
                  </Route>
                </Route>

                <Route element={<PublicLayout />}>
                  <Route path="*" element={<NotFoundPage />} />
                </Route>
              </Routes>
            </Suspense>
          </ToastProvider>
        </AuthProvider>
      </SettingsProvider>
    </BrowserRouter>
  );
}
