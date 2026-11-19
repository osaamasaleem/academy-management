import axios from 'axios';

const apiBaseUrl = import.meta.env.VITE_API_URL || '';

export const apiClient = axios.create({
  baseURL: `${apiBaseUrl}/api`,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json'
  }
});

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    return Promise.reject(error.response?.data?.error || error);
  }
);

export default apiClient;
