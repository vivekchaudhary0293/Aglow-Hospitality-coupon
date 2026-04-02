import React, { useState, useEffect, useRef } from 'react';
import { 
  auth, 
  db, 
  loginWithGoogle, 
  logout, 
  OperationType, 
  handleFirestoreError 
} from './firebase';
import { 
  onAuthStateChanged, 
  User as FirebaseUser 
} from 'firebase/auth';
import { 
  collection, 
  addDoc, 
  query, 
  where, 
  orderBy, 
  onSnapshot, 
  setDoc,
  doc,
  deleteDoc,
  getDocs,
  writeBatch
} from 'firebase/firestore';
import { 
  Printer, 
  History, 
  PlusCircle, 
  LogOut, 
  Utensils, 
  Coffee, 
  Cookie, 
  ChevronRight,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Settings,
  Plus,
  Trash2,
  Edit2,
  Wifi,
  WifiOff,
  ShoppingBag,
  X,
  Save,
  RefreshCw,
  Sparkles,
  ImageIcon
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { generateMenuItemImage } from './services/geminiService';

// --- Types ---
interface Item {
  id: string;
  name: string;
  price: number;
  category?: string;
  imageUrl?: string;
}

interface CouponRecord {
  id: string;
  type: string;
  price: number;
  quantity: number;
  timestamp: string;
  generatedBy: string;
  businessName: string;
}

const BUSINESS_NAME = "Aglow Hospitality Sevices Ltd";
const LOGO_URL = "https://media.licdn.com/dms/image/v2/D4D0BAQEmzaJK_CMQiA/company-logo_200_200/company-logo_200_200/0/1701174038801/aglow_hospitality_services_pvt_ltd_logo?e=2147483647&v=beta&t=GNBo1cc289xIwaUkzwdhvpigmL9OS4Kyjk08VO2p81A";

// --- Components ---

const PrintableCoupon = ({ coupon, index }: { coupon: Partial<CouponRecord>, index: number, key?: any }) => (
  <div 
    key={index}
    id={`printable-coupon-${index}`}
    className="hidden print:block w-[50mm] p-2 border border-dashed border-black text-black font-mono text-center mx-auto"
    style={{ pageBreakAfter: 'always' }}
  >
    <div className="flex flex-col items-center">
      <img src={LOGO_URL} alt="Logo" className="w-12 h-12 mb-1 grayscale" referrerPolicy="no-referrer" />
      <h1 className="text-[10px] font-bold uppercase leading-tight">{BUSINESS_NAME}</h1>
    </div>
    <div className="border-b border-black my-1"></div>
    <h2 className="text-sm font-bold mb-0.5">{coupon.type}</h2>
    <p className="text-xl font-bold">₹{coupon.price}</p>
    <div className="my-2 text-[8px] leading-tight">
      <p>Date: {new Date().toLocaleDateString()}</p>
      <p>Time: {new Date().toLocaleTimeString()}</p>
      <p>ID: {coupon.id}</p>
    </div>
    <div className="border-t border-black my-1"></div>
    <p className="text-[7px] italic">Valid for today only</p>
    <p className="text-[7px]">Thank you!</p>
  </div>
);

export default function App() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'generate' | 'history' | 'manage'>('generate');
  const [items, setItems] = useState<Item[]>([]);
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);
  const [quantity, setQuantity] = useState<number>(1);
  const [history, setHistory] = useState<CouponRecord[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [isConfirmingPrint, setIsConfirmingPrint] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [syncQueue, setSyncQueue] = useState<CouponRecord[]>([]);
  const [printerIp, setPrinterIp] = useState(localStorage.getItem('aglow_printer_ip') || '');
  const [printerStatus, setPrinterStatus] = useState<'checking' | 'online' | 'offline' | 'unconfigured'>('unconfigured');

  // Item Management State
  const [editingItem, setEditingItem] = useState<Item | null>(null);
  const [isItemModalOpen, setIsItemModalOpen] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      if (user) {
        // Simple admin check based on email provided in context
        setIsAdmin(user.email === "vivekchaudhary0293@gmail.com");
      }
      setLoading(false);
    });

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Check printer status periodically
    const checkPrinter = async () => {
      if (!printerIp) {
        setPrinterStatus('unconfigured');
        return;
      }
      setPrinterStatus('checking');
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);
        // Using a simple fetch to check if the IP is reachable
        await fetch(`http://${printerIp}`, { mode: 'no-cors', signal: controller.signal });
        setPrinterStatus('online');
        clearTimeout(timeoutId);
      } catch (e) {
        setPrinterStatus('offline');
      }
    };

    checkPrinter();
    const printerInterval = setInterval(checkPrinter, 60000); // Check every minute

    return () => {
      unsubscribe();
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(printerInterval);
    };
  }, [printerIp]);

  // Load Items
  useEffect(() => {
    if (!user) return;

    const unsubscribe = onSnapshot(collection(db, 'items'), (snapshot) => {
      const itemList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Item));
      if (itemList.length === 0 && isOnline && isAdmin) {
        // Seed default items if empty (only if admin)
        const defaults = [
          { id: 'lunch', name: 'Lunch', price: 50, imageUrl: 'https://i0.wp.com/www.chitrasfoodbook.com/wp-content/uploads/2014/03/holi-lunch-recipes.jpg?w=1200&ssl=1' },
          { id: 'dinner', name: 'Dinner', price: 50, imageUrl: 'https://foodess.com/wp-content/uploads/2024/02/Naan-with-Butter-Paneer-and-Palak-Paneer.jpg' },
          { id: 'tea', name: 'Tea', price: 5, imageUrl: 'https://www.teaforturmeric.com/wp-content/uploads/2021/11/Masala-Chai-Tea-Recipe-Card.jpg' },
          { id: 'snacks', name: 'Snacks', price: 8, imageUrl: 'https://chandravilas.com/wp-content/uploads/2023/06/Jumbo-All-Stars-Snack-Pack.png' },
          { id: 'tea_snacks', name: 'Tea & Snacks', price: 13, imageUrl: 'http://buytea.com/cdn/shop/articles/samosas-bhajis-banner.webp?v=1695643802' },
        ];
        defaults.forEach(item => setDoc(doc(db, 'items', item.id), item));
      }
      setItems(itemList);
      localStorage.setItem('aglow_items', JSON.stringify(itemList));
    }, (err) => {
      console.error("Error loading items:", err);
      const cached = localStorage.getItem('aglow_items');
      if (cached) setItems(JSON.parse(cached));
    });

    return () => unsubscribe();
  }, [isOnline, user, isAdmin]);

  // Load History
  useEffect(() => {
    if (!user || !isOnline) return;

    const q = query(
      collection(db, 'coupons'),
      where('generatedBy', '==', user.uid),
      orderBy('timestamp', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const records = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as CouponRecord[];
      setHistory(records);
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'coupons');
    });

    return () => unsubscribe();
  }, [user, isOnline]);

  // Sync Queue
  useEffect(() => {
    if (isOnline && syncQueue.length > 0) {
      const sync = async () => {
        const batch = writeBatch(db);
        syncQueue.forEach(coupon => {
          const newDoc = doc(collection(db, 'coupons'));
          batch.set(newDoc, coupon);
        });
        try {
          await batch.commit();
          setSyncQueue([]);
          localStorage.removeItem('aglow_sync_queue');
        } catch (e) {
          console.error("Sync failed:", e);
        }
      };
      sync();
    }
  }, [isOnline, syncQueue]);

  // Load Sync Queue from LocalStorage
  useEffect(() => {
    const cached = localStorage.getItem('aglow_sync_queue');
    if (cached) setSyncQueue(JSON.parse(cached));
  }, []);

  const handleGenerate = async () => {
    if (!selectedItem || !user) return;

    setIsGenerating(true);
    setError(null);

    const timestamp = new Date().toISOString();
    const couponId = Math.random().toString(36).substr(2, 9).toUpperCase();
    const newCoupon: CouponRecord = {
      id: couponId,
      type: selectedItem.name,
      price: selectedItem.price,
      quantity: quantity,
      timestamp: timestamp,
      generatedBy: user.uid,
      businessName: BUSINESS_NAME,
    };

    try {
      if (isOnline) {
        await addDoc(collection(db, 'coupons'), newCoupon);
      } else {
        const newQueue = [...syncQueue, newCoupon];
        setSyncQueue(newQueue);
        localStorage.setItem('aglow_sync_queue', JSON.stringify(newQueue));
      }

      // Trigger Print
      if (printerStatus === 'online' && printerIp) {
        console.log(`Sending print job to Epson at ${printerIp}...`);
        window.print();
      } else {
        console.log("Network printer offline or unconfigured, using system default printer (USB)...");
        window.print();
      }

      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
      setQuantity(1);
      setSelectedItem(null);
      setIsConfirmingPrint(false);
    } catch (err) {
      console.error("Generation failed:", err);
      setError("Failed to generate coupon.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSaveItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem) return;

    setIsGeneratingImage(true);
    try {
      let finalItem = { ...editingItem };
      if (!finalItem.imageUrl && finalItem.name) {
        const aiImage = await generateMenuItemImage(finalItem.name);
        if (aiImage) {
          finalItem.imageUrl = aiImage;
        }
      }

      const itemDoc = doc(db, 'items', finalItem.id || Math.random().toString(36).substr(2, 9));
      await setDoc(itemDoc, { ...finalItem, id: itemDoc.id });
      setIsItemModalOpen(false);
      setEditingItem(null);
    } catch (err) {
      setError("Failed to save item.");
    } finally {
      setIsGeneratingImage(false);
    }
  };

  const handleDeleteItem = async (id: string) => {
    if (!confirm("Are you sure you want to delete this item?")) return;
    try {
      await deleteDoc(doc(db, 'items', id));
    } catch (err) {
      setError("Failed to delete item.");
    }
  };

  const handleResetHistory = async () => {
    if (!isAdmin || !confirm("Are you sure you want to delete ALL sales records? This action cannot be undone.")) return;
    setIsGenerating(true);
    try {
      const q = query(collection(db, 'coupons'));
      const snapshot = await getDocs(q);
      if (snapshot.empty) {
        setIsGenerating(false);
        return;
      }
      const batch = writeBatch(db);
      snapshot.docs.forEach((doc) => {
        batch.delete(doc.ref);
      });
      await batch.commit();
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
    } catch (err) {
      console.error("Reset history failed:", err);
      setError("Failed to reset history.");
    } finally {
      setIsGenerating(false);
    }
  };

  const salesSummary = React.useMemo(() => {
    const summary: Record<string, { quantity: number; revenue: number }> = {};
    history.forEach((record) => {
      if (!summary[record.type]) {
        summary[record.type] = { quantity: 0, revenue: 0 };
      }
      summary[record.type].quantity += record.quantity;
      summary[record.type].revenue += record.price * record.quantity;
    });
    return Object.entries(summary).map(([type, data]) => ({
      type,
      ...data,
    })).sort((a, b) => b.revenue - a.revenue);
  }, [history]);

  const totalRevenue = salesSummary.reduce((acc, curr) => acc + curr.revenue, 0);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="w-10 h-10 text-blue-600 animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-center">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full bg-white rounded-3xl shadow-xl p-8 space-y-8"
        >
          <div className="bg-yellow-400 w-24 h-24 rounded-full flex items-center justify-center mx-auto shadow-lg overflow-hidden border-4 border-white">
            <img src={LOGO_URL} alt="Logo" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{BUSINESS_NAME}</h1>
            <p className="text-slate-500 mt-2">Smart POS & Coupon System</p>
          </div>
          <button
            onClick={loginWithGoogle}
            className="w-full flex items-center justify-center gap-3 bg-white border-2 border-slate-100 py-4 px-6 rounded-2xl font-semibold text-slate-700 hover:bg-slate-50 transition-all active:scale-95"
          >
            <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="w-6 h-6" alt="Google" />
            Sign in with Google
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-24 font-sans">
      {/* Header */}
      <header className="bg-white px-6 py-4 flex items-center justify-between shadow-sm sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full overflow-hidden border border-slate-100">
            <img src={LOGO_URL} alt="Logo" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
          </div>
          <div>
            <h1 className="font-bold text-slate-900 leading-tight text-sm sm:text-base">{BUSINESS_NAME}</h1>
            <div className="flex items-center gap-2">
              {isOnline ? (
                <span className="flex items-center gap-1 text-[10px] text-green-600 font-bold uppercase tracking-wider">
                  <Wifi className="w-3 h-3" /> Online
                </span>
              ) : (
                <span className="flex items-center gap-1 text-[10px] text-orange-600 font-bold uppercase tracking-wider">
                  <WifiOff className="w-3 h-3" /> Offline Mode
                </span>
              )}
              <span className={`flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider ${
                printerStatus === 'online' ? 'text-blue-600' : 
                printerStatus === 'checking' ? 'text-slate-400' : 'text-amber-600'
              }`}>
                <Printer className={`w-3 h-3 ${printerStatus === 'checking' ? 'animate-pulse' : ''}`} /> 
                {printerStatus === 'online' ? 'Network Printer Ready' : 
                 printerStatus === 'checking' ? 'Checking Printer...' : 
                 printerStatus === 'unconfigured' ? 'USB Printer (Default)' : 'USB Printer (Fallback)'}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <button 
              onClick={() => setActiveTab('manage')}
              className={`p-2 rounded-xl transition-colors ${activeTab === 'manage' ? 'bg-blue-50 text-blue-600' : 'text-slate-400 hover:bg-slate-50'}`}
            >
              <Settings className="w-6 h-6" />
            </button>
          )}
          <button 
            onClick={logout}
            className="p-2 text-slate-400 hover:text-red-500 transition-colors"
          >
            <LogOut className="w-6 h-6" />
          </button>
        </div>
      </header>

      <main className="p-4 max-w-4xl mx-auto">
        {activeTab === 'generate' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Items Grid */}
            <div className="lg:col-span-2 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-slate-900">Menu Items</h2>
                {!isOnline && syncQueue.length > 0 && (
                  <div className="flex items-center gap-2 text-xs font-bold text-orange-600 bg-orange-50 px-3 py-1 rounded-full">
                    <RefreshCw className="w-3 h-3 animate-spin" /> {syncQueue.length} Pending Sync
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                {items.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setSelectedItem(item)}
                    className={`relative overflow-hidden rounded-3xl border-2 transition-all group ${
                      selectedItem?.id === item.id 
                        ? 'border-blue-600 bg-blue-50' 
                        : 'border-white bg-white shadow-sm hover:shadow-md hover:border-slate-100'
                    }`}
                  >
                    <div className="aspect-square w-full bg-slate-100 relative overflow-hidden">
                      <img 
                        src={item.imageUrl || `https://picsum.photos/seed/${item.name}/300/300`} 
                        alt={item.name} 
                        className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                        referrerPolicy="no-referrer"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent flex flex-col justify-end p-3">
                        <p className="text-white font-bold text-sm leading-tight">{item.name}</p>
                        <p className="text-white/80 text-xs font-medium">₹{item.price}</p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Cart/Summary */}
            <div className="lg:col-span-1">
              <AnimatePresence mode="wait">
                {selectedItem ? (
                  <motion.div 
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 20 }}
                    className="bg-white rounded-3xl shadow-lg border border-slate-100 overflow-hidden sticky top-24"
                  >
                    <div className="p-6 space-y-6">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 rounded-2xl bg-slate-100 overflow-hidden border border-slate-100">
                            <img 
                              src={selectedItem.imageUrl || `https://picsum.photos/seed/${selectedItem.name}/100/100`} 
                              alt={selectedItem.name} 
                              className="w-full h-full object-cover"
                              referrerPolicy="no-referrer"
                            />
                          </div>
                          <div>
                            <h3 className="font-bold text-slate-900">{selectedItem.name}</h3>
                            <p className="text-xs text-slate-400">Unit Price: ₹{selectedItem.price}</p>
                          </div>
                        </div>
                        <button onClick={() => setSelectedItem(null)} className="text-slate-300 hover:text-slate-500">
                          <X className="w-5 h-5" />
                        </button>
                      </div>

                      <div className="space-y-3">
                        <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Quantity</label>
                        <div className="flex items-center justify-between bg-slate-50 p-2 rounded-2xl">
                          <button 
                            onClick={() => setQuantity(q => Math.max(1, q - 1))}
                            className="w-12 h-12 rounded-xl bg-white shadow-sm flex items-center justify-center text-xl font-bold text-slate-600 active:scale-90 transition-transform"
                          >
                            -
                          </button>
                          <span className="text-2xl font-black text-slate-900">{quantity}</span>
                          <button 
                            onClick={() => setQuantity(q => q + 1)}
                            className="w-12 h-12 rounded-xl bg-white shadow-sm flex items-center justify-center text-xl font-bold text-slate-600 active:scale-90 transition-transform"
                          >
                            +
                          </button>
                        </div>
                      </div>

                      <div className="pt-6 border-t border-slate-50 space-y-4">
                        <div className="flex items-center justify-between">
                          <span className="text-slate-500 font-medium">Total Amount</span>
                          <span className="text-3xl font-black text-slate-900">₹{selectedItem.price * quantity}</span>
                        </div>
                        <button
                          onClick={() => setIsConfirmingPrint(true)}
                          className="w-full bg-blue-600 text-white py-4 rounded-2xl font-bold shadow-xl shadow-blue-200 flex items-center justify-center gap-3 active:scale-95 transition-all"
                        >
                          <Printer className="w-6 h-6" />
                          Print Coupons
                        </button>
                      </div>
                    </div>
                  </motion.div>
                ) : (
                  <div className="bg-slate-100/50 border-2 border-dashed border-slate-200 rounded-3xl p-12 text-center space-y-4 sticky top-24">
                    <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center mx-auto shadow-sm text-slate-300">
                      <ShoppingBag className="w-8 h-8" />
                    </div>
                    <div>
                      <p className="font-bold text-slate-400">No Item Selected</p>
                      <p className="text-xs text-slate-400 mt-1">Select an item from the menu to generate coupons</p>
                    </div>
                  </div>
                )}
              </AnimatePresence>
            </div>
          </div>
        )}

        {activeTab === 'history' && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-slate-900">Item-wise Sales Summary</h2>
              <div className="flex items-center gap-3">
                {isAdmin && history.length > 0 && (
                  <button 
                    onClick={handleResetHistory}
                    disabled={isGenerating}
                    className="text-xs font-bold text-red-600 bg-red-50 px-3 py-1 rounded-full border border-red-100 hover:bg-red-100 transition-all disabled:opacity-50 flex items-center gap-1"
                  >
                    {isGenerating ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                    Reset History
                  </button>
                )}
                <div className="text-xs font-bold text-slate-400 bg-white px-3 py-1 rounded-full border border-slate-100">
                  Items: {salesSummary.length}
                </div>
                <div className="text-xs font-bold text-blue-600 bg-blue-50 px-3 py-1 rounded-full border border-blue-100">
                  Total Revenue: ₹{totalRevenue}
                </div>
              </div>
            </div>
            
            <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 text-slate-400 text-[10px] uppercase font-black tracking-widest">
                    <th className="px-6 py-4">Menu Item</th>
                    <th className="px-6 py-4">Total Quantity Sold</th>
                    <th className="px-6 py-4">Total Revenue Generated</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {salesSummary.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="px-6 py-12 text-center text-slate-300 italic">
                        No sales records found
                      </td>
                    </tr>
                  ) : (
                    salesSummary.map((summary) => (
                      <tr key={summary.type} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600">
                              <Utensils className="w-4 h-4" />
                            </div>
                            <span className="font-bold text-slate-700 text-sm">{summary.type}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 font-bold text-slate-500 text-sm">{summary.quantity}</td>
                        <td className="px-6 py-4 font-black text-slate-900 text-sm">₹{summary.revenue}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </motion.div>
        )}

        {activeTab === 'manage' && isAdmin && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-slate-900">Manage Menu</h2>
              <div className="flex gap-2">
                <button 
                  onClick={async () => {
                    if (!confirm("This will reset all items to defaults. Existing items will be overwritten. Continue?")) return;
                    setIsGenerating(true);
                    try {
                      const defaults = [
                        { id: 'lunch', name: 'Lunch', price: 50, imageUrl: 'https://i0.wp.com/www.chitrasfoodbook.com/wp-content/uploads/2014/03/holi-lunch-recipes.jpg?w=1200&ssl=1' },
                        { id: 'dinner', name: 'Dinner', price: 50, imageUrl: 'https://foodess.com/wp-content/uploads/2024/02/Naan-with-Butter-Paneer-and-Palak-Paneer.jpg' },
                        { id: 'tea', name: 'Tea', price: 5, imageUrl: 'https://www.teaforturmeric.com/wp-content/uploads/2021/11/Masala-Chai-Tea-Recipe-Card.jpg' },
                        { id: 'snacks', name: 'Snacks', price: 8, imageUrl: 'https://chandravilas.com/wp-content/uploads/2023/06/Jumbo-All-Stars-Snack-Pack.png' },
                        { id: 'tea_snacks', name: 'Tea & Snacks', price: 13, imageUrl: 'http://buytea.com/cdn/shop/articles/samosas-bhajis-banner.webp?v=1695643802' },
                      ];
                      const batch = writeBatch(db);
                      defaults.forEach(item => batch.set(doc(db, 'items', item.id), item));
                      await batch.commit();
                      setShowSuccess(true);
                      setTimeout(() => setShowSuccess(false), 3000);
                    } catch (err) {
                      setError("Failed to reset defaults.");
                    } finally {
                      setIsGenerating(false);
                    }
                  }}
                  disabled={isGenerating}
                  className="bg-slate-100 text-slate-600 px-4 py-2 rounded-xl text-xs font-bold hover:bg-slate-200 transition-all disabled:opacity-50 flex items-center gap-2"
                >
                  {isGenerating ? <RefreshCw className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                  Reset Defaults
                </button>
                <button 
                  onClick={() => { setEditingItem({ id: '', name: '', price: 0 }); setIsItemModalOpen(true); }}
                  className="bg-blue-600 text-white p-2 rounded-xl shadow-lg shadow-blue-100"
                >
                  <Plus className="w-6 h-6" />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Printer Settings */}
              <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 col-span-full">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600">
                    <Printer className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900">Printer Configuration</h3>
                    <p className="text-xs text-slate-400">Epson TM-T88VI (Network/USB)</p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Printer IP Address</label>
                    <input 
                      type="text" 
                      value={printerIp}
                      onChange={e => {
                        setPrinterIp(e.target.value);
                        localStorage.setItem('aglow_printer_ip', e.target.value);
                      }}
                      className="w-full bg-slate-50 border-none rounded-2xl p-4 focus:ring-2 focus:ring-blue-600 transition-all text-sm"
                      placeholder="e.g. 192.168.1.100"
                    />
                  </div>
                  <div className="flex flex-col justify-end">
                    <div className={`px-4 py-4 rounded-2xl font-bold text-xs flex items-center gap-2 ${
                      printerStatus === 'online' ? 'bg-green-50 text-green-600' : 
                      printerStatus === 'checking' ? 'bg-blue-50 text-blue-600' :
                      'bg-slate-50 text-slate-400'
                    }`}>
                      {printerStatus === 'online' ? <CheckCircle2 className="w-4 h-4" /> : 
                       printerStatus === 'checking' ? <RefreshCw className="w-4 h-4 animate-spin" /> :
                       <AlertCircle className="w-4 h-4" />}
                      {printerStatus === 'online' ? 'Online' : 
                       printerStatus === 'checking' ? 'Checking...' : 
                       printerStatus === 'unconfigured' ? 'Not Set' : 'Offline'}
                    </div>
                  </div>
                </div>
                <p className="text-[10px] text-slate-400 mt-3 italic">
                  * Status: {
                    printerStatus === 'online' ? 'Epson TM-T88VI is reachable via network.' :
                    printerStatus === 'checking' ? 'Verifying network connection to printer...' :
                    printerStatus === 'unconfigured' ? 'No IP configured. Using system default printer (USB).' :
                    'Network printer unreachable. Using system default printer (USB) as fallback.'
                  }
                </p>
              </div>

              {items.map((item) => (
                <div key={item.id} className="bg-white p-4 rounded-3xl shadow-sm border border-slate-100 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <img 
                      src={item.imageUrl || `https://picsum.photos/seed/${item.name}/100/100`} 
                      alt={item.name} 
                      className="w-12 h-12 rounded-xl object-cover"
                      referrerPolicy="no-referrer"
                    />
                    <div>
                      <p className="font-bold text-slate-900">{item.name}</p>
                      <p className="text-sm text-blue-600 font-bold">₹{item.price}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button 
                      onClick={() => { setEditingItem(item); setIsItemModalOpen(true); }}
                      className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                    >
                      <Edit2 className="w-5 h-5" />
                    </button>
                    <button 
                      onClick={() => handleDeleteItem(item.id)}
                      className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </main>

      {/* Success Notification */}
      <AnimatePresence>
        {showSuccess && (
          <motion.div 
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-28 left-1/2 -translate-x-1/2 bg-green-600 text-white px-6 py-3 rounded-2xl shadow-2xl z-[100] flex items-center gap-2 font-bold"
          >
            <CheckCircle2 className="w-5 h-5" />
            Action Successful!
          </motion.div>
        )}
      </AnimatePresence>

      {/* Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-100 px-8 py-4 flex items-center justify-around z-10">
        <button 
          onClick={() => setActiveTab('generate')}
          className={`flex flex-col items-center gap-1 transition-all ${activeTab === 'generate' ? 'text-blue-600 scale-110' : 'text-slate-400 hover:text-slate-600'}`}
        >
          <ShoppingBag className="w-6 h-6" />
          <span className="text-[10px] font-black uppercase tracking-tighter">POS</span>
        </button>
        <button 
          onClick={() => setActiveTab('history')}
          className={`flex flex-col items-center gap-1 transition-all ${activeTab === 'history' ? 'text-blue-600 scale-110' : 'text-slate-400 hover:text-slate-600'}`}
        >
          <History className="w-6 h-6" />
          <span className="text-[10px] font-black uppercase tracking-tighter">Sales</span>
        </button>
        {isAdmin && (
          <button 
            onClick={() => setActiveTab('manage')}
            className={`flex flex-col items-center gap-1 transition-all ${activeTab === 'manage' ? 'text-blue-600 scale-110' : 'text-slate-400 hover:text-slate-600'}`}
          >
            <Settings className="w-6 h-6" />
            <span className="text-[10px] font-black uppercase tracking-tighter">Menu</span>
          </button>
        )}
      </nav>

      {/* Confirmation Modal */}
      <AnimatePresence>
        {isConfirmingPrint && selectedItem && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-white w-full max-w-sm rounded-[2.5rem] shadow-2xl overflow-hidden"
            >
              <div className="p-8 space-y-6">
                <div className="text-center space-y-2">
                  <div className="w-20 h-20 bg-slate-100 rounded-3xl overflow-hidden mx-auto shadow-sm border-2 border-white">
                    <img 
                      src={selectedItem.imageUrl || `https://picsum.photos/seed/${selectedItem.name}/200/200`} 
                      alt={selectedItem.name} 
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  </div>
                  <h3 className="text-xl font-bold text-slate-900">Confirm Printing</h3>
                  <p className="text-sm text-slate-500">Please verify the coupon details</p>
                </div>

                <div className="bg-slate-50 rounded-2xl p-4 space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-400">Item</span>
                    <span className="font-bold text-slate-900">{selectedItem.name}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-400">Quantity</span>
                    <span className="font-bold text-slate-900">{quantity} Coupons</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-400">Unit Price</span>
                    <span className="font-bold text-slate-900">₹{selectedItem.price}</span>
                  </div>
                  <div className="pt-3 border-t border-slate-200 flex justify-between items-center">
                    <span className="font-bold text-slate-900">Total</span>
                    <span className="text-2xl font-black text-blue-600">₹{selectedItem.price * quantity}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider justify-center">
                  <Printer className="w-3 h-3" /> 
                  Using: {printerStatus === 'online' ? 'Network Printer' : 'USB Printer'}
                </div>

                <div className="flex gap-3">
                  <button 
                    onClick={() => setIsConfirmingPrint(false)}
                    className="flex-1 py-4 rounded-2xl font-bold text-slate-400 hover:bg-slate-50 transition-all"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={handleGenerate}
                    disabled={isGenerating}
                    className="flex-[2] bg-blue-600 text-white py-4 rounded-2xl font-bold shadow-xl shadow-blue-100 flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {isGenerating ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
                    Confirm & Print
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Item Modal */}
      <AnimatePresence>
        {isItemModalOpen && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl overflow-hidden"
            >
              <form onSubmit={handleSaveItem} className="p-8 space-y-6">
                <div className="flex items-center justify-between">
                  <h3 className="text-xl font-bold text-slate-900">{editingItem?.id ? 'Edit Item' : 'Add New Item'}</h3>
                  <button type="button" onClick={() => setIsItemModalOpen(false)} className="text-slate-300 hover:text-slate-500">
                    <X className="w-6 h-6" />
                  </button>
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-400 uppercase">Item Name</label>
                    <input 
                      type="text" 
                      required
                      value={editingItem?.name || ''}
                      onChange={e => setEditingItem(prev => ({ ...prev!, name: e.target.value }))}
                      className="w-full bg-slate-50 border-none rounded-2xl p-4 focus:ring-2 focus:ring-blue-600 transition-all"
                      placeholder="e.g. Special Lunch"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-400 uppercase">Price (₹)</label>
                    <input 
                      type="number" 
                      required
                      value={editingItem?.price || ''}
                      onChange={e => setEditingItem(prev => ({ ...prev!, price: Number(e.target.value) }))}
                      className="w-full bg-slate-50 border-none rounded-2xl p-4 focus:ring-2 focus:ring-blue-600 transition-all"
                      placeholder="0.00"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-400 uppercase">Image URL (Optional)</label>
                    <div className="flex gap-2">
                      <input 
                        type="url" 
                        value={editingItem?.imageUrl || ''}
                        onChange={e => setEditingItem(prev => ({ ...prev!, imageUrl: e.target.value }))}
                        className="flex-1 bg-slate-50 border-none rounded-2xl p-4 focus:ring-2 focus:ring-blue-600 transition-all"
                        placeholder="https://..."
                      />
                      <button
                        type="button"
                        disabled={isGeneratingImage || !editingItem?.name}
                        onClick={async () => {
                          if (!editingItem?.name) return;
                          setIsGeneratingImage(true);
                          const aiImage = await generateMenuItemImage(editingItem.name);
                          if (aiImage) {
                            setEditingItem(prev => ({ ...prev!, imageUrl: aiImage }));
                          }
                          setIsGeneratingImage(false);
                        }}
                        className="bg-blue-50 text-blue-600 p-4 rounded-2xl hover:bg-blue-100 transition-all disabled:opacity-50"
                        title="Generate with AI"
                      >
                        <Sparkles className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                </div>

                <button 
                  type="submit"
                  disabled={isGeneratingImage}
                  className="w-full bg-blue-600 text-white py-4 rounded-2xl font-bold shadow-xl shadow-blue-100 flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isGeneratingImage ? (
                    <>
                      <Sparkles className="w-5 h-5 animate-pulse" />
                      Generating Image...
                    </>
                  ) : (
                    <>
                      <Save className="w-5 h-5" />
                      Save Item
                    </>
                  )}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Hidden Printable Area */}
      <div className="hidden print:block">
        {selectedItem && Array.from({ length: quantity }).map((_, i) => (
          <PrintableCoupon key={i} index={i} coupon={{ type: selectedItem.name, price: selectedItem.price, id: Math.random().toString(36).substr(2, 6).toUpperCase() }} />
        ))}
      </div>

      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          .print\\:block, .print\\:block * {
            visibility: visible;
          }
          .print\\:block {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
          }
          @page {
            size: 50mm auto;
            margin: 0;
          }
        }
      `}</style>
    </div>
  );
}
