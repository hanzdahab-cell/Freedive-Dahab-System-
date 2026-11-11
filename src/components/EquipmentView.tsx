import React, { useState } from 'react';
import { Equipment, EquipmentCheckout, Student, User, UserRole } from '../types';
import { Language, translations } from '../i18n';
import {
  Package,
  Plus,
  AlertTriangle,
  CheckCircle,
  Clock,
  Search,
  Filter,
  ArrowUpRight,
  ArrowDownLeft,
  X,
  Shield,
} from 'lucide-react';

interface EquipmentViewProps {
  equipment: Equipment[];
  checkouts: EquipmentCheckout[];
  students: Student[];
  instructors: User[];
  userRole: UserRole;
  onRefresh: () => void;
  onAddEquipment: (equipmentData: any) => Promise<void>;
  onCheckoutEquipment: (equipmentId: string, checkoutData: any) => Promise<void>;
  onReturnEquipment: (equipmentId: string, returnData: any) => Promise<void>;
  lang: Language;
}

export const EquipmentView: React.FC<EquipmentViewProps> = ({
  equipment,
  checkouts,
  students,
  instructors,
  userRole,
  onRefresh,
  onAddEquipment,
  onCheckoutEquipment,
  onReturnEquipment,
  lang,
}) => {
  const t = translations[lang];
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');

  // Modals
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedGearForCheckout, setSelectedGearForCheckout] = useState<Equipment | null>(null);
  const [selectedGearForReturn, setSelectedGearForReturn] = useState<EquipmentCheckout | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // New equipment state
  const [newGear, setNewGear] = useState({
    item_name: '',
    category: 'bifins',
    size: '41-42',
    brand_model: 'Leaderfins Carbon',
    quantity_total: 4,
    condition: 'excellent',
    location: 'Gear Room A - Dahab Main',
    low_stock_threshold: 2,
    notes: '',
  });

  // Checkout state
  const [checkoutData, setCheckoutData] = useState({
    student_id: students[0]?.id || '',
    instructor_id: instructors[0]?.id || '',
    expected_return: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString().slice(0, 16),
    condition_out: 'excellent',
    notes: 'Checked before departure to Blue Hole',
  });

  // Return state
  const [returnData, setReturnData] = useState({
    condition_in: 'good',
    notes: 'Rinsed with fresh water, dried in shade.',
  });

  const canManageGear = ['owner', 'operations_manager', 'equipment_manager'].includes(userRole);

  const filteredGear = equipment.filter((eq) => {
    const matchesSearch =
      eq.item_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      eq.barcode.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (eq.brand_model && eq.brand_model.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesCat = categoryFilter === 'ALL' || eq.category === categoryFilter;
    return matchesSearch && matchesCat;
  });

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);
    try {
      await onAddEquipment(newGear);
      setIsAddModalOpen(false);
      await onRefresh();
    } catch (err: any) {
      setFormError(err.message || 'Failed to add equipment');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCheckoutSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedGearForCheckout) return;
    setFormError(null);
    setSubmitting(true);
    try {
      await onCheckoutEquipment(selectedGearForCheckout.id, checkoutData);
      setSelectedGearForCheckout(null);
      await onRefresh();
    } catch (err: any) {
      setFormError(err.message || 'Failed to checkout gear');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReturnSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedGearForReturn) return;
    setFormError(null);
    setSubmitting(true);
    try {
      await onReturnEquipment(selectedGearForReturn.id, returnData);
      setSelectedGearForReturn(null);
      await onRefresh();
    } catch (err: any) {
      setFormError(err.message || 'Failed to return gear');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-[#E8EEF7] dark:border-slate-800">
        <div>
          <h2 className="text-xl font-black text-[#28334E] dark:text-white flex items-center gap-2">
            <Package className="w-5 h-5 text-[#4C8BF5]" />
            <span>Equipment & Gear Locker</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Dahab gear inventory, inspection logs, dive computers, carbon fins, and checkout audits.
          </p>
        </div>

        {canManageGear && (
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#4C8BF5] hover:bg-[#3B7BE8] text-white font-semibold text-xs shadow-md shadow-blue-500/20 transition-all cursor-pointer self-start sm:self-auto"
          >
            <Plus className="w-4 h-4" />
            <span>Register Gear</span>
          </button>
        )}
      </div>

      {/* Search & Filters */}
      <div className="flex flex-col sm:flex-row items-center gap-3 bg-white dark:bg-[#1E293B] p-3 rounded-2xl border border-[#E8EEF7] dark:border-slate-800 shadow-xs">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by gear name, model, or barcode..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-[#F4F6FA] dark:bg-[#071322] border border-[#E8EEF7] dark:border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-[#4C8BF5]"
          />
        </div>

        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="bg-[#F4F6FA] dark:bg-[#071322] border border-[#E8EEF7] dark:border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-700 dark:text-slate-300 focus:outline-none focus:border-[#4C8BF5] w-full sm:w-auto"
        >
          <option value="ALL">All Categories</option>
          <option value="bifins">Long Bifins</option>
          <option value="monofins">Carbon Monofins</option>
          <option value="wetsuits">Wetsuits</option>
          <option value="computers">Dive Computers</option>
          <option value="lanyards">Safety Lanyards</option>
          <option value="buoys_weights">Buoys & Lines</option>
          <option value="safety_o2">Oxygen & First Aid</option>
        </select>
      </div>

      {/* Equipment Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredGear.map((item) => {
          const isLowStock = item.quantity_available <= item.low_stock_threshold;
          const isOutOfStock = item.quantity_available === 0;

          return (
            <div
              key={item.id}
              className={`p-5 rounded-2xl bg-white dark:bg-[#1E293B] border transition-all flex flex-col justify-between space-y-4 shadow-xs ${
                isLowStock 
                  ? 'border-amber-400 dark:border-amber-500/50' 
                  : 'border-[#E8EEF7] dark:border-slate-800 hover:border-[#4C8BF5]/40'
              }`}
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[10px] text-[#4C8BF5] bg-blue-50 dark:bg-blue-950/60 px-2 py-0.5 rounded border border-blue-200 dark:border-blue-800 font-semibold">
                    {item.barcode}
                  </span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                    {item.category.replace('_', ' ')}
                  </span>
                </div>

                <h3 className="text-sm font-extrabold text-[#28334E] dark:text-white">{item.item_name}</h3>

                <div className="text-xs text-slate-600 dark:text-slate-300 space-y-1">
                  <div>Model: <strong className="text-slate-900 dark:text-white">{item.brand_model || '—'}</strong></div>
                  <div>Size / Spec: <strong className="text-[#4C8BF5]">{item.size || 'Universal'}</strong></div>
                  <div>Storage: <span className="text-slate-500 dark:text-slate-400">{item.location}</span></div>
                </div>

                {item.notes && (
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 italic bg-slate-50 dark:bg-[#071322] p-2.5 rounded-xl border border-[#E8EEF7] dark:border-slate-800">
                    {item.notes}
                  </p>
                )}
              </div>

              <div className="pt-3 border-t border-[#E8EEF7] dark:border-slate-800 space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5">
                    <span className="text-slate-500 dark:text-slate-400">Available:</span>
                    <strong className={`font-mono text-sm ${isOutOfStock ? 'text-rose-600 dark:text-rose-400' : isLowStock ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                      {item.quantity_available} / {item.quantity_total}
                    </strong>
                  </div>

                  <span className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${
                    item.condition === 'excellent' 
                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-400' 
                      : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                  }`}>
                    {item.condition}
                  </span>
                </div>

                {/* Checkout & Return Actions */}
                <div className="grid grid-cols-1 gap-2">
                  <button
                    disabled={isOutOfStock}
                    onClick={() => {
                      setSelectedGearForCheckout(item);
                      setCheckoutData({
                        ...checkoutData,
                        condition_out: item.condition,
                      });
                    }}
                    className={`py-1.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-1 transition-colors cursor-pointer ${
                      isOutOfStock
                        ? 'bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-600 cursor-not-allowed'
                        : 'bg-[#4C8BF5] hover:bg-[#3B7BE8] text-white shadow-xs'
                    }`}
                  >
                    <ArrowUpRight className="w-3.5 h-3.5" />
                    <span>Checkout</span>
                  </button>

                </div>
              </div>
            </div>
          );
        })}
      </div>

      <section aria-labelledby="active-checkouts-title" className="space-y-3">
        <div>
          <h2 id="active-checkouts-title" className="text-lg font-bold text-[#28334E] dark:text-white">Active checkouts & rentals</h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">Return a specific unit to restore its inventory availability.</p>
        </div>
        {checkouts.length ? (
          <div className="overflow-x-auto rounded-2xl border border-[#E8EEF7] bg-white dark:border-slate-800 dark:bg-[#1E293B]">
            <table className="w-full min-w-[680px] text-left text-sm">
              <thead className="border-b border-[#E8EEF7] text-xs uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:text-slate-400">
                <tr>
                  <th scope="col" className="px-4 py-3 font-semibold">Gear</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Customer</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Checked out</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Expected back</th>
                  <th scope="col" className="px-4 py-3 font-semibold text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E8EEF7] dark:divide-slate-800">
                {checkouts.map((checkout) => (
                  <tr key={checkout.id}>
                    <td className="px-4 py-3">
                      <span className="font-semibold text-[#28334E] dark:text-white">{checkout.item_name}</span>
                      {checkout.size && <span className="ml-1 text-xs text-slate-500 dark:text-slate-400">· {checkout.size}</span>}
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{checkout.student_name || 'Staff / instructor'}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{new Date(checkout.checkout_time).toLocaleString()}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{checkout.expected_return ? new Date(checkout.expected_return).toLocaleString() : 'Not set'}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => setSelectedGearForReturn(checkout)}
                        className="min-h-9 rounded-lg px-3 text-xs font-semibold text-[#3069C4] hover:bg-blue-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#4C8BF5] dark:text-blue-300 dark:hover:bg-slate-800"
                      >
                        Return gear
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-8 text-sm text-slate-600 dark:border-slate-700 dark:bg-[#1E293B] dark:text-slate-400">
            No equipment is currently checked out.
          </div>
        )}
      </section>

      {/* CHECKOUT MODAL */}
      {selectedGearForCheckout && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#1E293B] border border-[#E8EEF7] dark:border-slate-800 rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto text-slate-700 dark:text-slate-200 shadow-2xl">
            <div className="p-5 border-b border-[#E8EEF7] dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-[#071322]">
              <div>
                <h3 className="text-base font-bold text-[#28334E] dark:text-white flex items-center gap-2">
                  <ArrowUpRight className="w-4 h-4 text-[#4C8BF5]" />
                  <span>Equipment Checkout</span>
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{selectedGearForCheckout.item_name}</p>
              </div>
              <button
                onClick={() => setSelectedGearForCheckout(null)}
                className="p-1 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCheckoutSubmit} className="p-6 space-y-4 text-xs">
              <div>
                <label className="block text-slate-600 dark:text-slate-400 mb-1 font-semibold">Assigned Diver (Student)</label>
                <select
                  value={checkoutData.student_id}
                  onChange={(e) => setCheckoutData({ ...checkoutData, student_id: e.target.value })}
                  className="w-full bg-[#F4F6FA] dark:bg-[#071322] border border-[#E8EEF7] dark:border-slate-800 rounded-lg p-2 text-slate-900 dark:text-white focus:outline-none focus:border-[#4C8BF5]"
                >
                  <option value="">None / Center Use</option>
                  {students.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.first_name} {s.last_name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-600 dark:text-slate-400 mb-1 font-semibold">Supervising Instructor</label>
                <select
                  value={checkoutData.instructor_id}
                  onChange={(e) => setCheckoutData({ ...checkoutData, instructor_id: e.target.value })}
                  className="w-full bg-[#F4F6FA] dark:bg-[#071322] border border-[#E8EEF7] dark:border-slate-800 rounded-lg p-2 text-slate-900 dark:text-white focus:outline-none focus:border-[#4C8BF5]"
                >
                  {instructors.map((i) => (
                    <option key={i.id} value={i.id}>{i.full_name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-600 dark:text-slate-400 mb-1 font-semibold">Condition at Checkout</label>
                <select
                  value={checkoutData.condition_out}
                  onChange={(e) => setCheckoutData({ ...checkoutData, condition_out: e.target.value })}
                  className="w-full bg-[#F4F6FA] dark:bg-[#071322] border border-[#E8EEF7] dark:border-slate-800 rounded-lg p-2 text-slate-900 dark:text-white focus:outline-none focus:border-[#4C8BF5]"
                >
                  <option value="new">New</option>
                  <option value="excellent">Excellent</option>
                  <option value="good">Good</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-600 dark:text-slate-400 mb-1 font-semibold">Expected Return Time</label>
                <input
                  type="datetime-local"
                  value={checkoutData.expected_return}
                  onChange={(e) => setCheckoutData({ ...checkoutData, expected_return: e.target.value })}
                  className="w-full bg-[#F4F6FA] dark:bg-[#071322] border border-[#E8EEF7] dark:border-slate-800 rounded-lg p-2 text-slate-900 dark:text-white focus:outline-none focus:border-[#4C8BF5]"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-[#E8EEF7] dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setSelectedGearForCheckout(null)}
                  className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 font-medium cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 rounded-xl bg-[#4C8BF5] hover:bg-[#3B7BE8] text-white font-semibold cursor-pointer shadow-md shadow-blue-500/20"
                >
                  {submitting ? 'Processing...' : 'Confirm Checkout'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* RETURN MODAL */}
      {selectedGearForReturn && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#1E293B] border border-[#E8EEF7] dark:border-slate-800 rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto text-slate-700 dark:text-slate-200 shadow-2xl">
            <div className="p-5 border-b border-[#E8EEF7] dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-[#071322]">
              <div>
                <h3 className="text-base font-bold text-[#28334E] dark:text-white flex items-center gap-2">
                  <ArrowDownLeft className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  <span>Equipment Return & Inspection</span>
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{selectedGearForReturn.item_name}</p>
              </div>
              <button
                onClick={() => setSelectedGearForReturn(null)}
                className="p-1 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleReturnSubmit} className="p-6 space-y-4 text-xs">
              <div>
                <label className="block text-slate-600 dark:text-slate-400 mb-1 font-semibold">Returned Condition *</label>
                <select
                  value={returnData.condition_in}
                  onChange={(e) => setReturnData({ ...returnData, condition_in: e.target.value })}
                  className="w-full bg-[#F4F6FA] dark:bg-[#071322] border border-[#E8EEF7] dark:border-slate-800 rounded-lg p-2 text-slate-900 dark:text-white focus:outline-none focus:border-[#4C8BF5]"
                >
                  <option value="excellent">Excellent (Ready for next diver)</option>
                  <option value="good">Good (Normal wear)</option>
                  <option value="needs_service">Needs Maintenance / Repair</option>
                  <option value="retired">Retired / Damaged</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-600 dark:text-slate-400 mb-1 font-semibold">Post-Dive Inspection Notes</label>
                <input
                  type="text"
                  value={returnData.notes}
                  onChange={(e) => setReturnData({ ...returnData, notes: e.target.value })}
                  placeholder="Fresh water rinse completed, zippers lubricated..."
                  className="w-full bg-[#F4F6FA] dark:bg-[#071322] border border-[#E8EEF7] dark:border-slate-800 rounded-lg p-2 text-slate-900 dark:text-white focus:outline-none focus:border-[#4C8BF5]"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-[#E8EEF7] dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setSelectedGearForReturn(null)}
                  className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 font-medium cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold cursor-pointer shadow-md shadow-emerald-600/20"
                >
                  {submitting ? 'Returning...' : 'Check In to Locker'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* REGISTER NEW GEAR MODAL */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#1E293B] border border-[#E8EEF7] dark:border-slate-800 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto text-slate-700 dark:text-slate-200 shadow-2xl">
            <div className="p-5 border-b border-[#E8EEF7] dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-[#071322]">
              <h3 className="text-base font-bold text-[#28334E] dark:text-white flex items-center gap-2">
                <Package className="w-4 h-4 text-[#4C8BF5]" />
                <span>Register Gear into Dahab Inventory</span>
              </h3>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="p-1 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddSubmit} className="p-6 space-y-4 text-xs">
              <div>
                <label className="block text-slate-600 dark:text-slate-400 mb-1 font-semibold">Item Name *</label>
                <input
                  type="text"
                  required
                  value={newGear.item_name}
                  onChange={(e) => setNewGear({ ...newGear, item_name: e.target.value })}
                  placeholder="e.g. Leaderfins Carbon Waves Long Bifins"
                  className="w-full bg-[#F4F6FA] dark:bg-[#071322] border border-[#E8EEF7] dark:border-slate-800 rounded-lg p-2 text-slate-900 dark:text-white focus:outline-none focus:border-[#4C8BF5]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-600 dark:text-slate-400 mb-1 font-semibold">Category *</label>
                  <select
                    value={newGear.category}
                    onChange={(e) => setNewGear({ ...newGear, category: e.target.value })}
                    className="w-full bg-[#F4F6FA] dark:bg-[#071322] border border-[#E8EEF7] dark:border-slate-800 rounded-lg p-2 text-slate-900 dark:text-white focus:outline-none focus:border-[#4C8BF5]"
                  >
                    <option value="bifins">Long Bifins</option>
                    <option value="monofins">Carbon Monofins</option>
                    <option value="wetsuits">Wetsuits</option>
                    <option value="computers">Dive Computers</option>
                    <option value="lanyards">Safety Lanyards</option>
                    <option value="buoys_weights">Buoys & Heavy Weights</option>
                    <option value="safety_o2">Oxygen & First Aid</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-600 dark:text-slate-400 mb-1 font-semibold">Brand & Model</label>
                  <input
                    type="text"
                    value={newGear.brand_model}
                    onChange={(e) => setNewGear({ ...newGear, brand_model: e.target.value })}
                    className="w-full bg-[#F4F6FA] dark:bg-[#071322] border border-[#E8EEF7] dark:border-slate-800 rounded-lg p-2 text-slate-900 dark:text-white focus:outline-none focus:border-[#4C8BF5]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-slate-600 dark:text-slate-400 mb-1 font-semibold">Size / Spec</label>
                  <input
                    type="text"
                    value={newGear.size}
                    onChange={(e) => setNewGear({ ...newGear, size: e.target.value })}
                    className="w-full bg-[#F4F6FA] dark:bg-[#071322] border border-[#E8EEF7] dark:border-slate-800 rounded-lg p-2 text-slate-900 dark:text-white focus:outline-none focus:border-[#4C8BF5]"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 dark:text-slate-400 mb-1 font-semibold">Total Quantity</label>
                  <input
                    type="number"
                    min={1}
                    value={newGear.quantity_total}
                    onChange={(e) => setNewGear({ ...newGear, quantity_total: Number(e.target.value) })}
                    className="w-full bg-[#F4F6FA] dark:bg-[#071322] border border-[#E8EEF7] dark:border-slate-800 rounded-lg p-2 text-slate-900 dark:text-white focus:outline-none focus:border-[#4C8BF5] font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 dark:text-slate-400 mb-1 font-semibold">Low Stock Alert Threshold</label>
                  <input
                    type="number"
                    min={1}
                    value={newGear.low_stock_threshold}
                    onChange={(e) => setNewGear({ ...newGear, low_stock_threshold: Number(e.target.value) })}
                    className="w-full bg-[#F4F6FA] dark:bg-[#071322] border border-[#E8EEF7] dark:border-slate-800 rounded-lg p-2 text-slate-900 dark:text-white focus:outline-none focus:border-[#4C8BF5] font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-600 dark:text-slate-400 mb-1 font-semibold">Storage Location in Center</label>
                <input
                  type="text"
                  value={newGear.location}
                  onChange={(e) => setNewGear({ ...newGear, location: e.target.value })}
                  className="w-full bg-[#F4F6FA] dark:bg-[#071322] border border-[#E8EEF7] dark:border-slate-800 rounded-lg p-2 text-slate-900 dark:text-white focus:outline-none focus:border-[#4C8BF5]"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-[#E8EEF7] dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 font-medium cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 rounded-xl bg-[#4C8BF5] hover:bg-[#3B7BE8] text-white font-semibold cursor-pointer shadow-md shadow-blue-500/20"
                >
                  {submitting ? 'Registering...' : 'Register Gear'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
