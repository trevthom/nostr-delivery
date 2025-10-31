// frontend/src/lib/api.ts

const API_BASE_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8080';

/**
 * API Client for backend communication
 */
class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string = API_BASE_URL) {
    this.baseUrl = baseUrl;
  }

  /**
   * Generic fetch wrapper with error handling
   */
  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    
    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: response.statusText }));
        throw new Error(error.error || `HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error('Network request failed');
    }
  }

  /**
   * GET request
   */
  async get<T>(endpoint: string, params?: Record<string, any>): Promise<T> {
    const queryString = params
      ? '?' + new URLSearchParams(params).toString()
      : '';
    
    return this.request<T>(`${endpoint}${queryString}`, {
      method: 'GET',
    });
  }

  /**
   * POST request
   */
  async post<T>(endpoint: string, data?: any): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  /**
   * PATCH request
   */
  async patch<T>(endpoint: string, data?: any): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'PATCH',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  /**
   * DELETE request
   */
  async delete<T>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'DELETE',
    });
  }

  // ============================================================================
  // Health & Status
  // ============================================================================

  async health(): Promise<{ status: string; timestamp: number }> {
    return this.get('/health');
  }

  // ============================================================================
  // Deliveries
  // ============================================================================

  async getDeliveries(params?: { status?: string }): Promise<any[]> {
    return this.get('/api/deliveries', params);
  }

  async getDelivery(id: string): Promise<any> {
    return this.get(`/api/deliveries/${id}`);
  }

  async createDelivery(data: any): Promise<any> {
    return this.post('/api/deliveries', data);
  }

  async placeBid(deliveryId: string, bidData: any): Promise<any> {
    return this.post(`/api/deliveries/${deliveryId}/bid`, bidData);
  }

  async acceptBid(deliveryId: string, bidIndex: number): Promise<any> {
    return this.post(`/api/deliveries/${deliveryId}/accept/${bidIndex}`);
  }

  async updateDeliveryStatus(deliveryId: string, status: string): Promise<any> {
    return this.patch(`/api/deliveries/${deliveryId}/status`, { status });
  }

  async confirmDelivery(deliveryId: string, rating?: number): Promise<any> {
    return this.post(`/api/deliveries/${deliveryId}/confirm`, { rating });
  }

  // ============================================================================
  // Users
  // ============================================================================

  async getUser(npub: string): Promise<any> {
    return this.get(`/api/user/${npub}`);
  }

  async updateUser(npub: string, data: any): Promise<any> {
    return this.patch(`/api/user/${npub}`, data);
  }

  // ============================================================================
  // WebSocket Connection
  // ============================================================================

  connectWebSocket(onMessage: (data: any) => void): WebSocket {
    const wsUrl = this.baseUrl.replace('http', 'ws');
    const ws = new WebSocket(`${wsUrl}/ws`);

    ws.onopen = () => {
      console.log('✅ WebSocket connected');
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        onMessage(data);
      } catch (error) {
        console.error('Failed to parse WebSocket message:', error);
      }
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    ws.onclose = () => {
      console.log('WebSocket disconnected');
    };

    return ws;
  }
}

// Export singleton instance
export const api = new ApiClient();

// Export class for custom instances
export { ApiClient };
