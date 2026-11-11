import React, { useMemo, useState } from 'react';
import { Anchor, BedDouble, Check, ChevronDown, CircleDollarSign, GraduationCap, Package, Plus, ShoppingBag, Trash2 } from 'lucide-react';
import { CustomerRequestInput, CustomerRequestItemInput, Equipment, Student } from '../types';

type Currency = 'EUR' | 'EGP' | 'USD';
type CatalogGroup = 'Courses' | 'Packages' | 'Training' | 'Activities' | 'Accommodation' | 'Shop' | 'Gear rental';

interface Product {
  id: string;
  group: CatalogGroup;
  name: string;
  category: CustomerRequestItemInput['category'];
  price?: number;
  priceCurrency?: Currency;
  unit?: string;
  description?: string;
  tier?: { minimumQuantity: number; unitPrice: number };
  stayDiscount?: boolean;
  equipmentId?: string;
  available?: number;
}

interface CartLine extends CustomerRequestItemInput {
  id: string;
  editablePrice: boolean;
  tier?: Product['tier'];
  stayDiscount?: boolean;
}

interface PosViewProps {
  students: Student[];
  equipment: Equipment[];
  onCreateCustomerRequest: (data: CustomerRequestInput) => Promise<void>;
  onRefresh: () => Promise<void> | void;
}

const localDate = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const daysFromNow = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return localDate(date);
};

const publishedProducts: Product[] = [
  { id: 'ssi-freediver', group: 'Courses', name: 'SSI Freediver', category: 'course', price: 310, priceCurrency: 'EUR' },
  { id: 'ssi-advanced', group: 'Courses', name: 'Advanced Freediver', category: 'course', price: 360, priceCurrency: 'EUR' },
  { id: 'ssi-performance', group: 'Courses', name: 'Performance Freediver', category: 'course', price: 480, priceCurrency: 'EUR' },
  { id: 'instructor-tuition', group: 'Courses', name: 'Instructor Course tuition', category: 'course', price: 1245, priceCurrency: 'EUR' },
  { id: 'instructor-kit', group: 'Courses', name: 'Instructor Course kit & fees', category: 'course', price: 200, priceCurrency: 'EUR' },
  { id: 'advanced-instructor-tuition', group: 'Courses', name: 'Advanced Instructor tuition', category: 'course', price: 1245, priceCurrency: 'EUR' },
  { id: 'advanced-instructor-kit', group: 'Courses', name: 'Advanced Instructor kit & fees', category: 'course', price: 200, priceCurrency: 'EUR' },
  { id: 'performance-instructor-day', group: 'Courses', name: 'Performance Instructor training', category: 'course', price: 120, priceCurrency: 'EUR', unit: 'day' },
  { id: 'performance-instructor-cert', group: 'Courses', name: 'Performance Instructor certification', category: 'course', price: 60, priceCurrency: 'EUR' },
  { id: 'react-right', group: 'Courses', name: 'React Right', category: 'course', price: 130, priceCurrency: 'EUR' },
  { id: 'marine-ecology', group: 'Courses', name: 'Marine Ecology', category: 'course', price: 150, priceCurrency: 'EUR' },
  { id: 'equalization-online', group: 'Courses', name: 'Equalization Class (online)', category: 'course', price: 55, priceCurrency: 'EUR' },
  { id: 'mouthfill', group: 'Courses', name: 'Mouthfill', category: 'course', price: 120, priceCurrency: 'EUR' },
  { id: 'beginner-week', group: 'Packages', name: 'Beginner Week', category: 'package', price: 450, priceCurrency: 'EUR', description: 'Beginner Week — diving only' },
  { id: 'advanced-week', group: 'Packages', name: 'Advanced Week', category: 'package', price: 490, priceCurrency: 'EUR' },
  { id: 'beginner-advanced-combo', group: 'Packages', name: 'Beginner + Advanced Combo', category: 'package', price: 690, priceCurrency: 'EUR' },
  { id: 'training-week-diving', group: 'Packages', name: 'Training Week — diving only', category: 'package', price: 300, priceCurrency: 'EUR' },
  { id: 'training-week-low', group: 'Packages', name: 'Training Week — 8 nights, low season', category: 'package', price: 445, priceCurrency: 'EUR' },
  { id: 'training-week-high', group: 'Packages', name: 'Training Week — 8 nights, high season', category: 'package', price: 485, priceCurrency: 'EUR' },
  { id: 'master-program', group: 'Packages', name: 'Master Program — from €335 / 2 weeks', category: 'package', description: 'Master Program — 2–5 weeks; confirm duration and final price' },
  { id: 'zero-to-hero', group: 'Packages', name: 'Zero to Hero', category: 'package', price: 2945, priceCurrency: 'EUR', description: 'Zero to Hero (website normal price €3,310)' },
  { id: 'training-techniques', group: 'Training', name: 'Training Techniques', category: 'course', price: 160, priceCurrency: 'EUR', tier: { minimumQuantity: 2, unitPrice: 135 } },
  { id: 'monofin-class', group: 'Training', name: 'Monofin class', category: 'course', price: 125, priceCurrency: 'EUR', tier: { minimumQuantity: 2, unitPrice: 110 } },
  { id: 'monofin-open-water', group: 'Training', name: 'Monofin full open-water version', category: 'course', price: 205, priceCurrency: 'EUR', tier: { minimumQuantity: 2, unitPrice: 190 } },
  { id: 'no-fins', group: 'Training', name: 'No-Fins', category: 'course', price: 125, priceCurrency: 'EUR', tier: { minimumQuantity: 2, unitPrice: 100 } },
  { id: 'variable-weight', group: 'Training', name: 'Variable Weight', category: 'course', price: 115, priceCurrency: 'EUR', tier: { minimumQuantity: 2, unitPrice: 100 } },
  { id: 'advanced-training-2', group: 'Training', name: 'Advanced Training — 2 weeks / 10 sessions', category: 'package', price: 375, priceCurrency: 'EUR' },
  { id: 'advanced-training-3', group: 'Training', name: 'Advanced Training — 3 weeks / 15 sessions', category: 'package', price: 535, priceCurrency: 'EUR' },
  { id: 'advanced-training-4', group: 'Training', name: 'Advanced Training — 4 weeks / 20 sessions', category: 'package', price: 665, priceCurrency: 'EUR' },
  { id: 'group-training', group: 'Training', name: 'Group training session', category: 'course', unit: 'session', description: 'Group training — confirm location and group-size rate' },
  { id: 'private-training', group: 'Training', name: 'Private training session', category: 'course', unit: 'session', description: 'Private training — confirm location and rate' },
  { id: 'ras-mohamed', group: 'Activities', name: 'Ras Mohamed', category: 'other', price: 78, priceCurrency: 'EUR' },
  { id: 'night-freedive', group: 'Activities', name: 'Night Freedive', category: 'other', price: 38, priceCurrency: 'EUR' },
  { id: 'desert-bbq', group: 'Activities', name: 'Desert BBQ', category: 'other', price: 20, priceCurrency: 'EUR' },
  { id: 'ice-bath', group: 'Activities', name: 'Ice Bath', category: 'other', price: 200, priceCurrency: 'EGP' },
  { id: 'yoga-morning', group: 'Activities', name: 'Yoga — morning', category: 'other', price: 4, priceCurrency: 'EUR' },
  { id: 'yoga-sunset', group: 'Activities', name: 'Yoga — Sunday sunset', category: 'other', price: 8, priceCurrency: 'EUR' },
  { id: 'room-lighthouse-low-single', group: 'Accommodation', name: 'Lighthouse Room · single · low season', category: 'accommodation', price: 25, priceCurrency: 'EUR', unit: 'night', stayDiscount: true },
  { id: 'room-lighthouse-low-double', group: 'Accommodation', name: 'Lighthouse Room · double · low season', category: 'accommodation', price: 35, priceCurrency: 'EUR', unit: 'night', stayDiscount: true },
  { id: 'room-lighthouse-high-single', group: 'Accommodation', name: 'Lighthouse Room · single · high season', category: 'accommodation', price: 30, priceCurrency: 'EUR', unit: 'night', stayDiscount: true },
  { id: 'room-lighthouse-high-double', group: 'Accommodation', name: 'Lighthouse Room · double · high season', category: 'accommodation', price: 40, priceCurrency: 'EUR', unit: 'night', stayDiscount: true },
  { id: 'room-blue-hole-low-single', group: 'Accommodation', name: 'Blue Hole Room · single · low season', category: 'accommodation', price: 25, priceCurrency: 'EUR', unit: 'night', stayDiscount: true },
  { id: 'room-blue-hole-low-double', group: 'Accommodation', name: 'Blue Hole Room · double · low season', category: 'accommodation', price: 35, priceCurrency: 'EUR', unit: 'night', stayDiscount: true },
  { id: 'room-blue-hole-high-single', group: 'Accommodation', name: 'Blue Hole Room · single · high season', category: 'accommodation', price: 30, priceCurrency: 'EUR', unit: 'night', stayDiscount: true },
  { id: 'room-blue-hole-high-double', group: 'Accommodation', name: 'Blue Hole Room · double · high season', category: 'accommodation', price: 40, priceCurrency: 'EUR', unit: 'night', stayDiscount: true },
  { id: 'room-eal-garden-low-single', group: 'Accommodation', name: 'Eal Garden Room · single · low season', category: 'accommodation', price: 25, priceCurrency: 'EUR', unit: 'night', stayDiscount: true },
  { id: 'room-eal-garden-low-double', group: 'Accommodation', name: 'Eal Garden Room · double · low season', category: 'accommodation', price: 35, priceCurrency: 'EUR', unit: 'night', stayDiscount: true },
  { id: 'room-eal-garden-high-single', group: 'Accommodation', name: 'Eal Garden Room · single · high season', category: 'accommodation', price: 30, priceCurrency: 'EUR', unit: 'night', stayDiscount: true },
  { id: 'room-eal-garden-high-double', group: 'Accommodation', name: 'Eal Garden Room · double · high season', category: 'accommodation', price: 40, priceCurrency: 'EUR', unit: 'night', stayDiscount: true },
  { id: 'room-islands-low-single', group: 'Accommodation', name: 'Islands Room · single · low season', category: 'accommodation', price: 25, priceCurrency: 'EUR', unit: 'night', stayDiscount: true },
  { id: 'room-islands-low-double', group: 'Accommodation', name: 'Islands Room · double · low season', category: 'accommodation', price: 35, priceCurrency: 'EUR', unit: 'night', stayDiscount: true },
  { id: 'room-islands-high-single', group: 'Accommodation', name: 'Islands Room · single · high season', category: 'accommodation', price: 30, priceCurrency: 'EUR', unit: 'night', stayDiscount: true },
  { id: 'room-islands-high-double', group: 'Accommodation', name: 'Islands Room · double · high season', category: 'accommodation', price: 40, priceCurrency: 'EUR', unit: 'night', stayDiscount: true },
  { id: 'nose-clip', group: 'Shop', name: 'Freedive Dahab nose clip', category: 'shop' },
  { id: 't-shirt', group: 'Shop', name: 'Freedive Dahab T-shirt', category: 'shop' },
  { id: 'poncho', group: 'Shop', name: 'Freedive Dahab poncho', category: 'shop' },
];

const groups: Array<{ name: CatalogGroup; icon: React.ComponentType<{ className?: string }> }> = [
  { name: 'Courses', icon: GraduationCap },
  { name: 'Packages', icon: Package },
  { name: 'Training', icon: Anchor },
  { name: 'Activities', icon: CircleDollarSign },
  { name: 'Accommodation', icon: BedDouble },
  { name: 'Shop', icon: ShoppingBag },
  { name: 'Gear rental', icon: Package },
];

const paymentMethods = ['Credit Card', 'Bank Transfer', 'InstaPay Egypt'];

const getUnitPrice = (item: CartLine) => {
  if (item.editablePrice) return item.unit_price;
  if (item.tier && item.quantity >= item.tier.minimumQuantity) return item.tier.unitPrice;
  if (item.stayDiscount) {
    const discount = item.quantity >= 21 ? 0.3 : item.quantity >= 10 ? 0.15 : 0;
    return Math.round(item.unit_price * (1 - discount) * 100) / 100;
  }
  return item.unit_price;
};

const formatMoney = (value: number, currency: Currency) =>
  `${currency} ${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const PosView: React.FC<PosViewProps> = ({ students, equipment, onCreateCustomerRequest, onRefresh }) => {
  const [activeGroup, setActiveGroup] = useState<CatalogGroup>('Courses');
  const [currency, setCurrency] = useState<Currency>('EUR');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [studentId, setStudentId] = useState(students[0]?.id || '');
  const [dueDate, setDueDate] = useState(() => daysFromNow(5));
  const [rentalReturnDate, setRentalReturnDate] = useState(() => daysFromNow(1));
  const [specialRequest, setSpecialRequest] = useState('');
  const [deposit, setDeposit] = useState('');
  const [paymentMethod, setPaymentMethod] = useState(`Cash EUR`);
  const [paymentDate, setPaymentDate] = useState(() => localDate(new Date()));
  const [paymentReference, setPaymentReference] = useState('');
  const [paymentNotes, setPaymentNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const products = useMemo(() => {
    const rentals = equipment
      .filter((item) => item.quantity_available > 0)
      .map((item): Product => ({
        id: `equipment-${item.id}`,
        group: 'Gear rental',
        name: `${item.item_name}${item.size ? ` · ${item.size}` : ''}`,
        category: 'gear_rental',
        equipmentId: item.id,
        available: item.quantity_available,
        description: `Gear rental — ${item.item_name}${item.size ? ` (${item.size})` : ''}`,
      }));
    return [...publishedProducts, ...rentals].filter((product) => product.group === activeGroup);
  }, [activeGroup, equipment]);

  const total = cart.reduce((sum, item) => sum + getUnitPrice(item) * item.quantity, 0);
  const minimumDeposit = Math.ceil(total * 0.3 * 100) / 100;
  const hasGearRental = cart.some((item) => Boolean(item.equipment_id));
  const hasUnpricedItems = cart.some((item) => !Number.isFinite(item.unit_price) || item.unit_price <= 0);

  const addProduct = (product: Product) => {
    setFormError(null);
    setSuccess(null);
    const priceMatchesCurrency = !product.priceCurrency || product.priceCurrency === currency;
    const fixedPrice = priceMatchesCurrency ? (product.price || 0) : 0;
    setCart((current) => [
      ...current,
      {
        id: `${product.id}-${crypto.randomUUID()}`,
        category: product.group === 'Training' ? 'training' : product.category,
        description: product.description || product.name,
        quantity: 1,
        unit_price: fixedPrice,
        editablePrice: !product.price || !priceMatchesCurrency,
        equipment_id: product.equipmentId,
        tier: product.tier,
        stayDiscount: product.stayDiscount,
      },
    ]);
  };

  const updateLine = (id: string, patch: Partial<CartLine>) => {
    setCart((current) => current.map((item) => item.id === id ? { ...item, ...patch } : item));
  };

  const handleCurrencyChange = (nextCurrency: Currency) => {
    setCurrency(nextCurrency);
    setPaymentMethod(`Cash ${nextCurrency}`);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError(null);
    setSuccess(null);

    if (!studentId) {
      setFormError('Choose a customer before saving this sale.');
      return;
    }
    if (!cart.length || hasUnpricedItems) {
      setFormError('Add at least one item and confirm every price before saving.');
      return;
    }
    if (cart.some((item) => item.equipment_id && item.quantity > (equipment.find((eq) => eq.id === item.equipment_id)?.quantity_available || 0))) {
      setFormError('The requested rental quantity exceeds current availability. Remove the item or reduce its quantity.');
      return;
    }
    const depositAmount = Number(deposit);
    if (!Number.isFinite(depositAmount) || depositAmount < minimumDeposit || depositAmount > total) {
      setFormError(`Record a deposit between ${formatMoney(minimumDeposit, currency)} and ${formatMoney(total, currency)}.`);
      return;
    }
    if (hasGearRental && !rentalReturnDate) {
      setFormError('Choose an expected return date for the gear rental.');
      return;
    }

    setSubmitting(true);
    try {
      await onCreateCustomerRequest({
        student_id: studentId,
        currency,
        due_date: dueDate,
        special_request: specialRequest,
        items: cart.map((item) => ({
          category: item.category,
          description: item.description,
          quantity: item.quantity,
          unit_price: getUnitPrice(item),
          ...(item.equipment_id ? { equipment_id: item.equipment_id, expected_return: rentalReturnDate } : {}),
        })),
        initial_payment: {
          amount: depositAmount,
          payment_method: paymentMethod,
          payment_date: paymentDate,
          reference_number: paymentReference,
          notes: paymentNotes,
        },
      });
      await onRefresh();
      setCart([]);
      setSpecialRequest('');
      setDeposit('');
      setPaymentReference('');
      setPaymentNotes('');
      setSuccess('Sale saved. The customer bill and deposit are available in Invoices & Bills.');
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'The sale could not be saved.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 border-b border-[#E8EEF7] pb-4 dark:border-slate-800 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-[#28334E] dark:text-white">Point of sale</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Build a customer bill from the Freedive Dahab catalogue and record the deposit once.
          </p>
        </div>
        <div className="w-full sm:w-44">
          <label htmlFor="pos-currency" className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">
            Bill currency
          </label>
          <select
            id="pos-currency"
            value={currency}
            disabled={cart.length > 0}
            onChange={(event) => handleCurrencyChange(event.target.value as Currency)}
            className="min-h-11 w-full rounded-xl border border-[#E2E8F0] bg-white px-3 text-sm text-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#4C8BF5] disabled:cursor-not-allowed disabled:bg-slate-100 dark:border-slate-700 dark:bg-[#1E293B] dark:text-white dark:disabled:bg-slate-800"
          >
            <option value="EUR">EUR — Euro</option>
            <option value="EGP">EGP — Egyptian Pound</option>
            <option value="USD">USD — US Dollar</option>
          </select>
        </div>
      </header>

      {formError && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">{formError}</p>}
      {success && <p role="status" aria-live="polite" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">{success}</p>}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.85fr)]">
        <section aria-labelledby="pos-catalog-title" className="min-w-0">
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h2 id="pos-catalog-title" className="text-lg font-bold text-[#28334E] dark:text-white">Catalogue</h2>
            <span className="text-xs text-slate-500 dark:text-slate-400">Prices shown in the selected bill currency</span>
          </div>
          <div role="tablist" aria-label="Product categories" className="mb-4 flex gap-2 overflow-x-auto pb-2">
            {groups.map(({ name, icon: Icon }) => (
              <button
                key={name}
                type="button"
                role="tab"
                aria-selected={activeGroup === name}
                onClick={() => setActiveGroup(name)}
                className={`inline-flex min-h-10 shrink-0 items-center gap-2 rounded-xl px-3 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#4C8BF5] ${
                  activeGroup === name
                    ? 'bg-[#28334E] text-white'
                    : 'border border-[#E2E8F0] bg-white text-slate-700 hover:border-[#4C8BF5] dark:border-slate-700 dark:bg-[#1E293B] dark:text-slate-200'
                }`}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                {name}
              </button>
            ))}
          </div>

          <ul className="divide-y divide-[#E8EEF7] rounded-2xl border border-[#E8EEF7] bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-[#1E293B]">
            {products.map((product) => {
              const isCurrencyMismatch = product.priceCurrency && product.priceCurrency !== currency;
              const priceText = product.price === undefined
                ? 'Confirm price'
                : `${product.priceCurrency} ${product.price.toLocaleString()}${product.unit ? ` / ${product.unit}` : ''}`;
              return (
                <li key={product.id} className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5">
                  <div className="min-w-0">
                    <p className="font-semibold text-[#28334E] dark:text-white">{product.name}</p>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      {product.tier
                        ? `${priceText} · ${product.tier.unitPrice} each for ${product.tier.minimumQuantity}+`
                        : product.stayDiscount
                          ? `${priceText} · 15% off 10–20 nights, 30% off 21–30 nights`
                          : product.description && product.description !== product.name
                            ? product.description
                            : priceText}
                    </p>
                    {isCurrencyMismatch && (
                      <p className="mt-1 text-xs font-medium text-amber-700 dark:text-amber-300">
                        Catalog rate is in {product.priceCurrency}; enter the confirmed {currency} price.
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => addProduct(product)}
                    className="inline-flex min-h-10 shrink-0 items-center gap-1 rounded-lg px-3 text-sm font-semibold text-[#3069C4] hover:bg-blue-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#4C8BF5] dark:text-blue-300 dark:hover:bg-slate-800"
                  >
                    <Plus className="h-4 w-4" aria-hidden="true" />
                    Add
                  </button>
                </li>
              );
            })}
            {products.length === 0 && (
              <li className="px-5 py-10 text-center text-sm text-slate-600 dark:text-slate-400">
                No gear is currently available to rent.
              </li>
            )}
          </ul>
          {activeGroup === 'Accommodation' && (
            <p className="mt-3 text-xs leading-5 text-slate-600 dark:text-slate-400">
              Low season is December–March; high season is April–November. Select the matching occupancy and season rate.
            </p>
          )}
          {activeGroup === 'Gear rental' && (
            <p className="mt-3 text-xs leading-5 text-slate-600 dark:text-slate-400">
              Rental prices are staff-confirmed. Saving the bill also checks the item out of inventory until it is returned.
            </p>
          )}
          {activeGroup === 'Shop' && (
            <p className="mt-3 text-xs leading-5 text-slate-600 dark:text-slate-400">
              Nose clip, T-shirt, and poncho prices are not published; enter the agreed price in the bill.
            </p>
          )}
        </section>

        <form onSubmit={handleSubmit} className="min-w-0 space-y-5 rounded-2xl border border-[#E8EEF7] bg-white p-4 dark:border-slate-800 dark:bg-[#1E293B] sm:p-5">
          <section aria-labelledby="pos-cart-title">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 id="pos-cart-title" className="text-lg font-bold text-[#28334E] dark:text-white">Current bill</h2>
              <button
                type="button"
                disabled={!cart.length}
                onClick={() => setCart([])}
                className="inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#4C8BF5] disabled:opacity-40 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                Clear
              </button>
            </div>

            {cart.length ? (
              <ul className="divide-y divide-[#E8EEF7] dark:divide-slate-800">
                {cart.map((item) => {
                  const unit = item.description.toLowerCase().includes('room') ? 'night' : 'item';
                  const lineTotal = getUnitPrice(item) * item.quantity;
                  return (
                    <li key={item.id} className="space-y-3 py-4 first:pt-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-semibold leading-5 text-[#28334E] dark:text-white">{item.description}</p>
                        <button
                          type="button"
                          aria-label={`Remove ${item.description}`}
                          onClick={() => setCart((current) => current.filter((line) => line.id !== item.id))}
                          className="min-h-9 min-w-9 rounded-lg text-rose-700 hover:bg-rose-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-rose-500 dark:text-rose-300 dark:hover:bg-rose-950/50"
                        >
                          <Trash2 className="mx-auto h-4 w-4" aria-hidden="true" />
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label htmlFor={`pos-quantity-${item.id}`} className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
                            Quantity {item.description.toLowerCase().includes('room') ? '(nights)' : `(${unit})`}
                          </label>
                          <input
                            id={`pos-quantity-${item.id}`}
                            type="number"
                            min="1"
                            max={item.equipment_id ? equipment.find((eq) => eq.id === item.equipment_id)?.quantity_available : 1000}
                            step="1"
                            value={item.quantity}
                            onChange={(event) => {
                              const quantity = Math.max(1, Number(event.target.value));
                              updateLine(item.id, {
                                quantity,
                                editablePrice: item.stayDiscount && quantity > 30 ? true : item.editablePrice,
                              });
                            }}
                            className="min-h-10 w-full rounded-lg border border-[#E2E8F0] bg-white px-2 text-sm text-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#4C8BF5] dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                          />
                        </div>
                        <div>
                          <label htmlFor={`pos-price-${item.id}`} className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
                            Unit price ({currency})
                          </label>
                          <input
                            id={`pos-price-${item.id}`}
                            type="number"
                            min="0.01"
                            step="0.01"
                            required
                            readOnly={!item.editablePrice}
                            value={item.editablePrice ? (item.unit_price || '') : getUnitPrice(item)}
                            onChange={(event) => updateLine(item.id, { unit_price: Number(event.target.value) })}
                            className="min-h-10 w-full rounded-lg border border-[#E2E8F0] bg-white px-2 text-sm text-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#4C8BF5] read-only:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:read-only:bg-slate-800"
                          />
                        </div>
                      </div>
                      {item.tier && item.quantity >= item.tier.minimumQuantity && (
                        <p className="text-xs font-medium text-emerald-700 dark:text-emerald-300">
                          Group rate applied: {currency} {item.tier.unitPrice} per person.
                        </p>
                      )}
                      {item.stayDiscount && item.quantity >= 10 && (
                        <p className="text-xs font-medium text-emerald-700 dark:text-emerald-300">
                          {item.quantity > 30
                            ? 'For stays longer than 30 nights, confirm the agreed nightly rate.'
                            : `Stay discount applied: ${item.quantity >= 21 ? '30%' : '15%'}.`}
                        </p>
                      )}
                      <p className="text-right text-sm font-semibold text-slate-700 dark:text-slate-200">
                        Line total: {formatMoney(lineTotal, currency)}
                      </p>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="rounded-xl border border-dashed border-slate-300 px-4 py-7 text-center text-sm text-slate-600 dark:border-slate-700 dark:text-slate-400">
                Add a course, activity, stay, shop item, or rental to start a bill.
              </div>
            )}
          </section>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label htmlFor="pos-customer" className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300">Customer *</label>
              <select
                id="pos-customer"
                required
                value={studentId}
                disabled={!students.length}
                onChange={(event) => setStudentId(event.target.value)}
                className="min-h-11 w-full rounded-lg border border-[#E2E8F0] bg-white px-3 text-sm text-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#4C8BF5] dark:border-slate-700 dark:bg-slate-900 dark:text-white"
              >
                <option value="">Select a customer</option>
                {students.map((student) => (
                  <option key={student.id} value={student.id}>
                    {student.first_name} {student.last_name} · {student.email}
                  </option>
                ))}
              </select>
              {!students.length && <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">Add a customer in Contacts before starting a sale.</p>}
            </div>
            <div>
              <label htmlFor="pos-due-date" className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300">Bill due date *</label>
              <input id="pos-due-date" type="date" required value={dueDate} onChange={(event) => setDueDate(event.target.value)} className="min-h-11 w-full rounded-lg border border-[#E2E8F0] bg-white px-3 text-sm text-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#4C8BF5] dark:border-slate-700 dark:bg-slate-900 dark:text-white" />
            </div>
            {hasGearRental && (
              <div>
                <label htmlFor="pos-rental-return" className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300">Rental return date *</label>
                <input id="pos-rental-return" type="date" required min={localDate(new Date())} value={rentalReturnDate} onChange={(event) => setRentalReturnDate(event.target.value)} className="min-h-11 w-full rounded-lg border border-[#E2E8F0] bg-white px-3 text-sm text-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#4C8BF5] dark:border-slate-700 dark:bg-slate-900 dark:text-white" />
              </div>
            )}
          </div>

          <div>
            <label htmlFor="pos-notes" className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300">Special request / notes</label>
            <textarea id="pos-notes" rows={2} maxLength={2000} value={specialRequest} onChange={(event) => setSpecialRequest(event.target.value)} placeholder="Dates, room occupancy, sizes, or customer preferences..." className="w-full rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-sm text-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#4C8BF5] dark:border-slate-700 dark:bg-slate-900 dark:text-white" />
          </div>

          <section aria-labelledby="pos-payment-title" className="space-y-3 border-t border-[#E8EEF7] pt-4 dark:border-slate-800">
            <div className="flex items-center justify-between gap-3">
              <h3 id="pos-payment-title" className="font-bold text-[#28334E] dark:text-white">Deposit received</h3>
              <span className="text-xs text-slate-600 dark:text-slate-400">Minimum 30%</span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="pos-deposit" className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300">Amount — min. {formatMoney(minimumDeposit, currency)} *</label>
                <input id="pos-deposit" type="number" min={minimumDeposit || 0.01} max={total} step="0.01" required value={deposit} onChange={(event) => setDeposit(event.target.value)} className="min-h-11 w-full rounded-lg border border-[#E2E8F0] bg-white px-3 text-sm text-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#4C8BF5] dark:border-slate-700 dark:bg-slate-900 dark:text-white" />
              </div>
              <div>
                <label htmlFor="pos-method" className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300">Payment method *</label>
                <select id="pos-method" value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)} className="min-h-11 w-full rounded-lg border border-[#E2E8F0] bg-white px-3 text-sm text-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#4C8BF5] dark:border-slate-700 dark:bg-slate-900 dark:text-white">
                  <option value={`Cash ${currency}`}>Cash ({currency})</option>
                  {paymentMethods.map((method) => <option key={method} value={method}>{method}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="pos-payment-date" className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300">Payment date *</label>
                <input id="pos-payment-date" type="date" required value={paymentDate} onChange={(event) => setPaymentDate(event.target.value)} className="min-h-11 w-full rounded-lg border border-[#E2E8F0] bg-white px-3 text-sm text-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#4C8BF5] dark:border-slate-700 dark:bg-slate-900 dark:text-white" />
              </div>
              <div>
                <label htmlFor="pos-payment-reference" className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300">Payment reference</label>
                <input id="pos-payment-reference" maxLength={100} value={paymentReference} onChange={(event) => setPaymentReference(event.target.value)} className="min-h-11 w-full rounded-lg border border-[#E2E8F0] bg-white px-3 text-sm text-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#4C8BF5] dark:border-slate-700 dark:bg-slate-900 dark:text-white" />
              </div>
            </div>
            <div>
              <label htmlFor="pos-payment-notes" className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300">Deposit notes</label>
              <input id="pos-payment-notes" maxLength={500} value={paymentNotes} onChange={(event) => setPaymentNotes(event.target.value)} className="min-h-11 w-full rounded-lg border border-[#E2E8F0] bg-white px-3 text-sm text-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#4C8BF5] dark:border-slate-700 dark:bg-slate-900 dark:text-white" />
            </div>
          </section>

          <div className="flex items-center justify-between gap-4 border-t border-[#E8EEF7] pt-4 dark:border-slate-800">
            <div>
              <p className="text-xs font-medium text-slate-600 dark:text-slate-400">Bill total</p>
              <p className="text-xl font-extrabold text-[#28334E] dark:text-white">{formatMoney(total, currency)}</p>
            </div>
            <button
              type="submit"
              disabled={submitting || !students.length || !cart.length || hasUnpricedItems}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#4C8BF5] px-4 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#3B7BE8] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#4C8BF5] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {success ? <Check className="h-4 w-4" aria-hidden="true" /> : <ChevronDown className="h-4 w-4 -rotate-90" aria-hidden="true" />}
              {submitting ? 'Saving sale…' : 'Save bill & deposit'}
            </button>
          </div>
          <p className="text-xs leading-5 text-slate-500 dark:text-slate-400">
            Every sale uses the shared customer-request ledger. Later payments are recorded against the bill and appear in Daily Income.
          </p>
        </form>
      </div>
    </div>
  );
};
