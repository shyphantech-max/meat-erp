/** Master data for the demo company. Names are fictional but typical of the Saudi meat trade. */
import type { BusinessType, Currency, Product, Species, StorageCategory, Supplier, Warehouse } from '@/types'

type P = [code: string, name: string, nameAr: string, species: Species, cat: StorageCategory, cartonKg: number, pack: string, cost: number, sell: number, reorder: number, shelf: number, origin: string]
const PRODUCTS: P[] = [
  ['CH-FWC-1000', 'Frozen Whole Chicken 1000g', 'دجاج كامل مجمد ١٠٠٠ جم', 'chicken', 'frozen', 10, 'Carton', 9.2, 11.5, 4000, 365, 'Brazil'],
  ['CH-FWC-1200', 'Frozen Whole Chicken 1200g', 'دجاج كامل مجمد ١٢٠٠ جم', 'chicken', 'frozen', 12, 'Carton', 9.0, 11.25, 3000, 365, 'Turkey'],
  ['CH-FRS-900', 'Fresh Whole Chicken 900g', 'دجاج كامل طازج ٩٠٠ جم', 'chicken', 'fresh', 9, 'Crate', 10.3, 13.0, 600, 5, 'Saudi Arabia'],
  ['CH-BRS-IQF', 'Frozen Chicken Breast Boneless (IQF)', 'صدور دجاج مجمدة بدون عظم', 'chicken', 'frozen', 10, 'Carton', 16.5, 20.5, 2000, 365, 'Brazil'],
  ['CH-BRS-CHL', 'Chilled Chicken Breast Fillet', 'فيليه صدور دجاج مبرد', 'chicken', 'chilled', 5, 'Tray carton', 18.9, 24.0, 1200, 10, 'Saudi Arabia'],
  ['CH-WNG-FRZ', 'Frozen Chicken Wings', 'أجنحة دجاج مجمدة', 'chicken', 'frozen', 10, 'Carton', 11.8, 14.75, 1500, 365, 'Brazil'],
  ['CH-LQ-FRZ', 'Frozen Chicken Leg Quarters', 'أرباع أفخاذ دجاج مجمدة', 'chicken', 'frozen', 15, 'Carton', 7.4, 9.25, 4000, 365, 'Brazil'],
  ['CH-THG-BL', 'Frozen Boneless Chicken Thigh', 'أفخاذ دجاج مجمدة بدون عظم', 'chicken', 'frozen', 10, 'Carton', 14.2, 17.9, 1200, 365, 'Brazil'],
  ['CH-DRM-FRZ', 'Frozen Chicken Drumsticks', 'دبابيس دجاج مجمدة', 'chicken', 'frozen', 10, 'Carton', 10.2, 12.9, 1000, 365, 'Turkey'],
  ['MT-CAR-AUS', 'Frozen Mutton Carcass (Australia)', 'ذبيحة ضأن مجمدة أسترالي', 'mutton', 'frozen', 18, 'Carcass', 24.0, 29.5, 2500, 365, 'Australia'],
  ['MT-CAR-NAE', 'Fresh Naeemi Mutton Carcass', 'ذبيحة نعيمي طازجة', 'mutton', 'fresh', 16, 'Carcass', 37.5, 46.0, 1500, 4, 'Saudi Arabia'],
  ['MT-BL-NZ', 'Frozen Boneless Mutton (New Zealand)', 'لحم ضأن مجمد بدون عظم نيوزيلندي', 'mutton', 'frozen', 20, 'Carton', 32.0, 39.5, 1500, 365, 'New Zealand'],
  ['MT-LEG-CHL', 'Chilled Boneless Lamb Leg', 'فخذ ضأن مبرد بدون عظم', 'mutton', 'chilled', 10, 'Carton', 42.0, 51.0, 500, 45, 'Australia'],
  ['MT-CUT-IND', 'Frozen Mutton Cuts (Shoulder & Ribs)', 'قطع ضأن مجمدة (كتف وريش)', 'mutton', 'frozen', 20, 'Carton', 21.5, 26.5, 2000, 365, 'India'],
  ['MT-MINCE', 'Chilled Mutton Mince', 'لحم ضأن مفروم مبرد', 'mutton', 'chilled', 5, 'Tray carton', 34.0, 42.0, 500, 6, 'Saudi Arabia'],
]
export const masterProducts = (): Product[] =>
  PRODUCTS.map(([code, name, nameAr, species, category, cartonKg, packLabel, costPrice, sellPrice, reorderLevelKg, shelfLifeDays, origin], i) => ({
    id: `prd_${i + 1}`, code, name, nameAr, species, category, cartonKg, packLabel, costPrice, sellPrice, reorderLevelKg, shelfLifeDays, origin, active: true,
  }))

export const masterWarehouses = (): Warehouse[] => [
  { id: 'wh_1', code: 'RUH-CS', name: 'Riyadh Central Cold Store', nameAr: 'مستودع الرياض المركزي المبرد', city: 'Riyadh', address: 'Al Sulay Industrial Area, Street 112, Riyadh', capacityKg: 450000, manager: 'Tariq Al Mutairi' },
  { id: 'wh_2', code: 'JED-PS', name: 'Jeddah Port Cold Store', nameAr: 'مستودع ميناء جدة المبرد', city: 'Jeddah', address: 'Al Khumrah Logistics Zone, Jeddah', capacityKg: 300000, manager: 'Hassan Bakr' },
  { id: 'wh_3', code: 'DMM-DH', name: 'Dammam Distribution Hub', nameAr: 'مركز توزيع الدمام', city: 'Dammam', address: '2nd Industrial City, Dammam', capacityKg: 180000, manager: 'Majed Al Ghamdi' },
]

type S = [name: string, type: Supplier['type'], country: string, city: string, contact: string, phone: string, email: string, cur: Currency, terms: number, products: Species[], rating: number]
const SUPPLIERS: S[] = [
  ['Paraná Avícola Exportadora Ltda.', 'international', 'Brazil', 'Curitiba', 'Rafael Moreira', '+55 41 3021 4410', 'export@paranaavicola.com.br', 'USD', 60, ['chicken'], 4.6],
  ['Santa Catarina Frangos S.A.', 'international', 'Brazil', 'Chapecó', 'Luciana Prado', '+55 49 3319 2200', 'sales@scfrangos.com.br', 'USD', 45, ['chicken'], 4.3],
  ['Anatolia Poultry Export A.Ş.', 'international', 'Turkey', 'Bursa', 'Emre Yıldız', '+90 224 441 7700', 'export@anatoliapoultry.com.tr', 'USD', 30, ['chicken'], 4.1],
  ['Riverina Lamb Exports Pty Ltd', 'international', 'Australia', 'Wagga Wagga', 'James Whitfield', '+61 2 6921 3380', 'gulf@riverinalamb.com.au', 'AUD', 30, ['mutton'], 4.7],
  ['Canterbury Meat Packers NZ Ltd', 'international', 'New Zealand', 'Christchurch', 'Aroha Tane', '+64 3 348 9120', 'mena@canterburymeat.co.nz', 'NZD', 30, ['mutton'], 4.5],
  ['Gujarat Halal Meats Pvt Ltd', 'international', 'India', 'Ahmedabad', 'Imtiyaz Shaikh', '+91 79 2658 1144', 'export@gujarathalal.in', 'USD', 21, ['mutton'], 3.9],
  ['Al Qassim Poultry Farms Co.', 'local', 'Saudi Arabia', 'Buraydah', 'Saleh Al Rasheed', '+966 16 381 2200', 'sales@qassimpoultry.sa', 'SAR', 15, ['chicken'], 4.4],
  ['Al Kharj Poultry Co.', 'local', 'Saudi Arabia', 'Al Kharj', 'Nasser Al Subaie', '+966 11 548 0310', 'orders@kharjpoultry.sa', 'SAR', 15, ['chicken'], 4.2],
  ['Najd Fresh Livestock Trading', 'local', 'Saudi Arabia', 'Riyadh', 'Fahad Al Shammari', '+966 11 265 7740', 'info@najdlivestock.sa', 'SAR', 7, ['mutton'], 4.0],
  ['Eastern Province Cold Chain Trading', 'local', 'Saudi Arabia', 'Dammam', 'Ali Al Zahrani', '+966 13 812 4455', 'sales@epcoldchain.sa', 'SAR', 30, ['chicken', 'mutton'], 3.8],
]
export const masterSuppliers = (): Supplier[] =>
  SUPPLIERS.map(([name, type, country, city, contactPerson, phone, email, currency, paymentTermsDays, products, rating], i) => ({
    id: `sup_${i + 1}`, code: `SUP-${String(i + 1).padStart(3, '0')}`, name, type, country, city, contactPerson, phone, email, currency, paymentTermsDays, products, rating, active: true,
  }))

export const FX: Record<Currency, number> = { SAR: 1, USD: 3.75, AUD: 2.45, NZD: 2.25 }

type C = [name: string, nameAr: string, type: BusinessType, city: string, district: string, contact: string, limit: number, terms: number, pay: 'cash' | 'credit', driver: number]
export const CUSTOMERS: C[] = [
  ['Bait Al Mandi Restaurant', 'مطعم بيت المندي', 'restaurant', 'Riyadh', 'Al Olaya', 'Abdulaziz Al Fahad', 40000, 15, 'credit', 1],
  ['Al Wurud Grand Hotel', 'فندق الورود الكبير', 'hotel', 'Riyadh', 'Al Wurud', 'Samir Haddad', 120000, 30, 'credit', 1],
  ['Al Nakheel Hypermarket', 'هايبر ماركت النخيل', 'supermarket', 'Riyadh', 'Al Nakheel', 'Waleed Al Saud', 150000, 30, 'credit', 1],
  ['Al Shamal Wholesale Meat Traders', 'الشمال لتجارة اللحوم بالجملة', 'wholesale', 'Riyadh', 'Al Aziziyah', 'Omar Al Anazi', 250000, 30, 'credit', 2],
  ['Riyadh Catering & Events Co.', 'شركة الرياض للإعاشة والمناسبات', 'catering', 'Riyadh', 'Al Malaz', 'Ziad Khoury', 80000, 30, 'credit', 2],
  ['Al Mathbi Restaurant', 'مطعم المثبي', 'restaurant', 'Riyadh', 'Al Rawdah', 'Hamad Al Qahtani', 25000, 7, 'cash', 2],
  ['Al Yasmin Supermarket', 'سوبرماركت الياسمين', 'supermarket', 'Riyadh', 'Al Yasmin', 'Rakesh Menon', 60000, 21, 'credit', 3],
  ['Dar Al Kabsa Restaurant', 'مطعم دار الكبسة', 'restaurant', 'Riyadh', 'Al Sulimaniyah', 'Mansour Al Harthi', 30000, 15, 'cash', 3],
  ['Al Malqa Hotel Suites', 'أجنحة الملقا الفندقية', 'hotel', 'Riyadh', 'Al Malqa', 'Elena Petrova', 70000, 30, 'credit', 3],
  ['Hayat Al Najd Shawarma', 'شاورما حياة نجد', 'restaurant', 'Riyadh', 'Al Murabba', 'Bilal Haddad', 10000, 7, 'credit', 4],
  ['Al Rawdah Meat Market', 'سوق الروضة للحوم', 'wholesale', 'Riyadh', 'Al Rawdah', 'Khalid Al Otaibi', 180000, 30, 'credit', 4],
  ['Al Sulimaniyah Mini Market', 'ميني ماركت السليمانية', 'supermarket', 'Riyadh', 'Al Sulimaniyah', 'Anwar Hossain', 20000, 14, 'cash', 4],
  ['Golden Spoon Catering', 'الملعقة الذهبية للإعاشة', 'catering', 'Riyadh', 'Al Sahafa', 'Tarek Mansour', 60000, 30, 'credit', 5],
  ['Al Murabba Broasted', 'بروستد المربع', 'restaurant', 'Riyadh', 'Al Murabba', 'Yasser Al Dossary', 20000, 7, 'cash', 5],
  ['Al Balad Grill House', 'مشويات البلد', 'restaurant', 'Jeddah', 'Al Balad', 'Mazen Bukhari', 30000, 15, 'credit', 6],
  ['Corniche Pearl Hotel', 'فندق لؤلؤة الكورنيش', 'hotel', 'Jeddah', 'Al Shati', 'Nadia Farouk', 110000, 30, 'credit', 6],
  ['Al Hamra Supermarket', 'سوبرماركت الحمراء', 'supermarket', 'Jeddah', 'Al Hamra', 'Sameer Qureshi', 50000, 21, 'credit', 7],
  ['Red Sea Meat Wholesalers', 'البحر الأحمر لتجارة اللحوم بالجملة', 'wholesale', 'Jeddah', 'Al Khumrah', 'Ahmed Bajaber', 200000, 30, 'credit', 7],
  ['Al Khobar Family Restaurant', 'مطعم الخبر العائلي', 'restaurant', 'Al Khobar', 'Al Aqrabiyah', 'Hussain Al Nemer', 25000, 15, 'cash', 8],
  ['Gulf Shore Hypermarket', 'هايبر ماركت شاطئ الخليج', 'supermarket', 'Dammam', 'Al Faisaliyah', 'Prakash Nair', 140000, 30, 'credit', 8],
]

export const DRIVERS: [name: string, nameAr: string, mobile: string, wh: string, status: 'on_duty' | 'off_duty' | 'on_leave'][] = [
  ['Faisal Al Harbi', 'فيصل الحربي', '+966 55 214 7731', 'wh_1', 'on_duty'],
  ['Mohammed Rafiq', 'محمد رفيق', '+966 50 381 2264', 'wh_1', 'on_duty'],
  ['Abdullah Al Qahtani', 'عبدالله القحطاني', '+966 54 902 1187', 'wh_1', 'on_duty'],
  ['Saleem Ahmed', 'سليم أحمد', '+966 56 447 3092', 'wh_1', 'on_duty'],
  ['Naveed Akhtar', 'نويد أختر', '+966 53 618 4405', 'wh_1', 'on_duty'],
  ['Khalid Al Dosari', 'خالد الدوسري', '+966 55 730 9918', 'wh_2', 'on_duty'],
  ['Joseph Thomas', 'جوزيف توماس', '+966 50 266 5821', 'wh_2', 'on_duty'],
  ['Yousef Al Shehri', 'يوسف الشهري', '+966 54 119 6370', 'wh_3', 'on_leave'],
]
export const VEHICLES: [plate: string, plateAr: string, type: string, make: string, cap: number][] = [
  ['RKA 4821', 'ر ك أ ٤٨٢١', 'Reefer Truck 3T', 'Isuzu NPR', 3000],
  ['RHB 7310', 'ر ح ب ٧٣١٠', 'Reefer Truck 2.5T', 'Hyundai HD72', 2500],
  ['RDS 2954', 'ر د س ٢٩٥٤', 'Chiller Van 1.2T', 'Toyota Hiace', 1200],
  ['RLN 6607', 'ر ل ن ٦٦٠٧', 'Reefer Truck 3T', 'Isuzu NPR', 3000],
  ['RMT 1148', 'ر م ط ١١٤٨', 'Chiller Van 1.5T', 'Ford Transit', 1500],
  ['JAD 3092', 'ج أ د ٣٠٩٢', 'Reefer Truck 4T', 'Mitsubishi Canter', 4000],
  ['JBK 5576', 'ج ب ك ٥٥٧٦', 'Reefer Truck 2.5T', 'Hyundai HD72', 2500],
  ['DSR 8840', 'د س ر ٨٨٤٠', 'Reefer Truck 3T', 'Isuzu NPR', 3000],
]

/** product preferences by business type (indexes into PRODUCTS) */
export const PREFS: Record<BusinessType, number[]> = {
  restaurant: [2, 0, 3, 5, 9, 10, 13, 7],
  hotel: [4, 3, 12, 11, 2, 10, 14, 5],
  supermarket: [0, 1, 6, 5, 8, 2, 3, 13, 14],
  wholesale: [6, 0, 1, 9, 13, 5, 8],
  catering: [0, 9, 13, 3, 7, 11, 2],
  walk_in: [2, 0, 10, 14, 3, 5],
}
export const QTY: Record<BusinessType, [number, number]> = {
  restaurant: [40, 140],
  hotel: [60, 180],
  supermarket: [90, 260],
  wholesale: [250, 600],
  catering: [80, 220],
  walk_in: [1, 12],
}
