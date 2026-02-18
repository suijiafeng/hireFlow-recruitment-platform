export interface Paginated<T> {
  total: number;
  page: number;
  pageSize: number;
  items: T[];
}

export interface Department {
  id: string;
  name: string;
}

export interface UserBrief {
  id: string;
  name: string;
  email?: string;
}
