import { z } from "zod";

// Phone Regex for Vietnam numbers
const phoneRegex = /(84|0[3|5|7|8|9])+([0-9]{8})\b/;

export const orderCreateSchema = z.object({
  shop_id: z.string().uuid("ID Shop không hợp lệ"),
  customer_name: z.string().min(2, "Tên khách hàng phải có ít nhất 2 ký tự"),
  customer_phone: z.string().regex(phoneRegex, "Số điện thoại không đúng định dạng Việt Nam"),
  address: z.string().min(5, "Địa chỉ phải có ít nhất 5 ký tự"),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  delivery_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Ngày giao hàng phải theo định dạng YYYY-MM-DD"),
  time_slot_start: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, "Giờ bắt đầu time slot không hợp lệ (HH:MM)"),
  time_slot_end: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, "Giờ kết thúc time slot không hợp lệ (HH:MM)"),
  weight_kg: z.number().positive("Khối lượng đơn hàng phải lớn hơn 0"),
  priority: z.number().int().min(1).max(5).default(1),
  notes: z.string().optional().nullable(),
});

export const orderBulkImportRowSchema = z.object({
  order_code: z.string().min(1, "Mã đơn hàng không được để trống"),
  customer_name: z.string().min(2, "Tên khách hàng phải có ít nhất 2 ký tự"),
  customer_phone: z.string(),
  address: z.string().min(5, "Địa chỉ phải có ít nhất 5 ký tự"),
  delivery_date: z.string(),
  time_slot_start: z.string().default("08:00"),
  time_slot_end: z.string().default("18:00"),
  weight_kg: z.number().positive(),
  priority: z.number().int().min(1).max(5).default(1),
  notes: z.string().optional(),
});

export const warehouseCreateSchema = z.object({
  shop_id: z.string().uuid("ID Shop không hợp lệ"),
  name: z.string().min(2, "Tên kho phải có ít nhất 2 ký tự"),
  address: z.string().min(5, "Địa chỉ kho phải có ít nhất 5 ký tự"),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  is_default: z.boolean().default(false),
});

export const vehicleCreateSchema = z.object({
  shop_id: z.string().uuid("ID Shop không hợp lệ"),
  name: z.string().min(2, "Tên phương tiện phải từ 2 ký tự"),
  vehicle_type: z.enum(["electric_motorbike", "motorbike", "small_van", "light_truck"]),
  license_plate: z.string().min(4, "Biển số xe không hợp lệ"),
  capacity_kg: z.number().positive("Sức chứa phải lớn hơn 0"),
  co2_kg_per_km: z.number().nonnegative("Hệ số CO2 phải lớn hơn hoặc bằng 0"),
  fuel_cost_vnd_per_km: z.number().nonnegative("Chi phí nhiên liệu phải lớn hơn hoặc bằng 0"),
  status: z.enum(["active", "maintenance", "inactive"]).default("active"),
});

export const shipperShiftCreateSchema = z.object({
  shop_id: z.string().uuid("ID Shop không hợp lệ"),
  shipper_id: z.string().uuid("ID Shipper không hợp lệ"),
  shift_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Ngày ca làm việc YYYY-MM-DD"),
  start_time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
  end_time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
  start_warehouse_id: z.string().uuid().optional().nullable(),
  max_work_minutes: z.number().int().positive().default(480),
});

export const packagingPickupCreateSchema = z.object({
  shop_id: z.string().uuid("ID Shop không hợp lệ"),
  address: z.string().min(5, "Địa chỉ thu gom phải có ít nhất 5 ký tự"),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  packaging_type: z.string().min(2, "Loại bao bì không hợp lệ"),
  estimated_quantity_kg: z.number().positive("Khối lượng ước tính phải lớn hơn 0"),
  pickup_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  available_from: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
  available_until: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
});
