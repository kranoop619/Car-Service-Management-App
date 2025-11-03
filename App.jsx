import React, { useState, useEffect, useCallback } from 'react';
// The problematic ES module import has been removed. The Supabase library 
// will now be loaded globally via a <script> tag in the JSX output.

// --- Supabase Configuration and Initialization ---
const SUPABASE_CONFIG = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
const SUPABASE_URL = SUPABASE_CONFIG.supabaseUrl || "https://<your-project-id>.supabase.co"; 
const SUPABASE_ANON_KEY = SUPABASE_CONFIG.supabaseKey || "your-anon-key";

// Function to generate a stable, temporary user ID (mocking anonymous auth)
const getAnonymousUserId = () => {
    return typeof __app_id !== 'undefined' ? `${__app_id}-anon-user` : 'anon-default-user';
};

// Get today's date in YYYY-MM-DD format for default value
const today = new Date().toISOString().split('T')[0];

// Fixed constants for payment mode (these rarely change)
const PAYMENT_MODES = ['Card', 'Cash', 'Bank Transfer', 'Mobile Pay'];

const App = () => {
    // Shared State
    const [supabaseClient, setSupabaseClient] = useState(null); 
    const [isAuthReady, setIsAuthReady] = useState(false);
    const [userId] = useState(getAnonymousUserId()); 
    const [activeTab, setActiveTab] = useState('service'); // 'service', 'expense', or 'config'

    // Configuration State (New)
    const [dynamicServiceTypes, setDynamicServiceTypes] = useState([]);
    const [dynamicExpenseCategories, setDynamicExpenseCategories] = useState([]);
    const [isConfigLoading, setIsConfigLoading] = useState(true);

    // Service State (Existing Logic)
    const [services, setServices] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [serviceMessage, setServiceMessage] = useState('');
    const [serviceFormState, setServiceFormState] = useState({
        regNumber: '',
        serviceType: '', // Now dynamic, set later or defaults to empty
        notes: '',
        amount: '',
        paymentMode: PAYMENT_MODES[0],
        dateOfService: today, 
    });
    
    // Expense State (Existing Logic)
    const [expenses, setExpenses] = useState([]);
    const [isExpenseLoading, setIsExpenseLoading] = useState(true);
    const [expenseMessage, setExpenseMessage] = useState('');
    const [expenseFormState, setExpenseFormState] = useState({
        dateOfExpense: today, 
        category: '', // Now dynamic, set later or defaults to empty
        description: '',
        amount: '',
    });

    // --- Configuration Data Fetching and Real-time Subscriptions ---

    const fetchConfigAndSubscribe = useCallback(async (client) => {
        if (!client) return () => {};
        setIsConfigLoading(true);

        // --- Fetch Service Types ---
        const { data: serviceData, error: serviceError } = await client
            .from('config_services')
            .select('id, name') // Only fetch id and name
            .order('name', { ascending: true });

        if (serviceError) console.error("Error fetching service configs:", serviceError);
        setDynamicServiceTypes(serviceData || []);

        // --- Fetch Expense Categories ---
        const { data: expenseData, error: expenseError } = await client
            .from('config_expenses')
            .select('id, name') // Only fetch id and name
            .order('name', { ascending: true });

        if (expenseError) console.error("Error fetching expense configs:", expenseError);
        setDynamicExpenseCategories(expenseData || []);
        
        setIsConfigLoading(false);

        // --- Real-time Subscriptions for Config ---
        const serviceSub = client
            .channel('service_config_updates')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'config_services' }, () => {
                client.from('config_services').select('id, name').order('name', { ascending: true })
                    .then(({ data: newData }) => setDynamicServiceTypes(newData || []));
            })
            .subscribe();

        const expenseSub = client
            .channel('expense_config_updates')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'config_expenses' }, () => {
                client.from('config_expenses').select('id, name').order('name', { ascending: true })
                    .then(({ data: newData }) => setDynamicExpenseCategories(newData || []));
            })
            .subscribe();

        return () => { 
            client.removeChannel(serviceSub);
            client.removeChannel(expenseSub);
        };
    }, []);

    // --- Service Data Fetching and Real-time Subscriptions ---

    const fetchServiceAndSubscribe = useCallback(async (client) => {
        if (!client) return () => {};
        setIsLoading(true);

        // Renamed 'services' to 'jobcarrd'
        const { data, error } = await client.from('jobcarrd').select('*').order('created_at', { ascending: false });

        if (error) {
            console.error("Error fetching services:", error);
            setServiceMessage(`Error loading history: ${error.message}`);
            setIsLoading(false);
            return () => {};
        }
        setServices(data || []);
        setIsLoading(false);

        const subscription = client
            .channel('service_updates')
            // Renamed 'services' to 'jobcarrd' in subscription setup
            .on('postgres_changes', { event: '*', schema: 'public', table: 'jobcarrd' }, () => {
                client.from('jobcarrd').select('*').order('created_at', { ascending: false })
                    .then(({ data: newData, error: newError }) => {
                        if (newError) console.error("Error updating service list:", newError);
                        if (newData) setServices(newData);
                    });
            })
            .subscribe();

        return () => client.removeChannel(subscription);
    }, []);

    // --- Expense Data Fetching and Real-time Subscriptions ---

    const fetchExpensesAndSubscribe = useCallback(async (client) => {
        if (!client) return () => {};
        setIsExpenseLoading(true);

        const { data, error } = await client.from('expenses').select('*').order('dateOfExpense', { ascending: false });

        if (error) {
            console.error("Error fetching expenses:", error);
            setExpenseMessage(`Error loading expenses: ${error.message}`);
            setIsExpenseLoading(false);
            return () => {};
        }
        setExpenses(data || []);
        setIsExpenseLoading(false);

        const subscription = client
            .channel('expense_updates')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'expenses' }, () => {
                client.from('expenses').select('*').order('dateOfExpense', { ascending: false })
                    .then(({ data: newData, error: newError }) => {
                        if (newError) console.error("Error updating expense list:", newError);
                        if (newData) setExpenses(newData);
                    });
            })
            .subscribe();

        return () => client.removeChannel(subscription);
    }, []);

    // 1. App Initialization (Script loading check and Data Subscriptions)
    useEffect(() => {
        const initializeSupabase = () => {
            if (window.supabase && window.supabase.createClient) {
                const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
                setSupabaseClient(client);
                setIsAuthReady(true); 
                
                // Start all subscriptions
                const cleanupService = fetchServiceAndSubscribe(client);
                const cleanupExpense = fetchExpensesAndSubscribe(client);
                const cleanupConfig = fetchConfigAndSubscribe(client);

                return () => {
                    cleanupService();
                    cleanupExpense();
                    cleanupConfig();
                };
            } else {
                const timer = setTimeout(initializeSupabase, 100); 
                return () => clearTimeout(timer);
            }
        };

        const cleanup = initializeSupabase();
        return cleanup;

    }, [fetchServiceAndSubscribe, fetchExpensesAndSubscribe, fetchConfigAndSubscribe]); 

    // 2. Set Default Form Values when Config Loads
    useEffect(() => {
        if (!isConfigLoading) {
            // Set default service type
            if (dynamicServiceTypes.length > 0 && serviceFormState.serviceType === '') {
                setServiceFormState(prev => ({ 
                    ...prev, 
                    serviceType: dynamicServiceTypes[0].name 
                }));
            }
            // Set default expense category
            if (dynamicExpenseCategories.length > 0 && expenseFormState.category === '') {
                setExpenseFormState(prev => ({ 
                    ...prev, 
                    category: dynamicExpenseCategories[0].name 
                }));
            }
        }
    }, [isConfigLoading, dynamicServiceTypes, dynamicExpenseCategories, serviceFormState.serviceType, expenseFormState.category]);


    // --- Service Form Handlers ---

    const handleServiceChange = (e) => {
        const { name, value } = e.target;
        setServiceFormState(prev => ({
            ...prev,
            [name]: name === 'amount' ? parseFloat(value) || '' : value,
        }));
    };

    const handleServiceSubmit = useCallback(async (e) => {
        e.preventDefault();
        setServiceMessage('');

        const client = supabaseClient;
        if (!client || !isAuthReady) {
            setServiceMessage('Error: Database connection failed.');
            return;
        }

        const { regNumber, serviceType, notes, amount, paymentMode, dateOfService } = serviceFormState;

        if (!regNumber || !serviceType || !amount || !paymentMode || !dateOfService) {
            setServiceMessage('Please fill in required service fields.');
            return;
        }

        if (amount <= 0) {
            setServiceMessage('Amount must be a positive number.');
            return;
        }

        try {
            const newEntry = {
                regNumber: regNumber.toUpperCase().trim(),
                serviceType,
                notes,
                amount: parseFloat(amount),
                paymentMode,
                dateOfService,
                recordedBy: userId,
            };

            // Renamed 'services' to 'jobcarrd'
            const { error } = await client.from('jobcarrd').insert([newEntry]).select();

            if (error) {
                console.error("Error adding service document: ", error);
                setServiceMessage(`Failed to record service. Error: ${error.message}`);
                return;
            }

            setServiceFormState(prev => ({
                regNumber: '',
                serviceType: prev.serviceType, // Keep selected type, clear others
                notes: '',
                amount: '',
                paymentMode: PAYMENT_MODES[0],
                dateOfService: today,
            }));
            setServiceMessage('Service entry successfully recorded!');
        } catch (error) {
            console.error("Unexpected error during service submission: ", error);
            setServiceMessage(`Failed to record service. Unexpected error.`);
        }
    }, [serviceFormState, isAuthReady, userId, supabaseClient]);


    // --- Expense Form Handlers ---

    const handleExpenseChange = (e) => {
        const { name, value } = e.target;
        setExpenseFormState(prev => ({
            ...prev,
            [name]: name === 'amount' ? parseFloat(value) || '' : value,
        }));
    };

    const handleExpenseSubmit = useCallback(async (e) => {
        e.preventDefault();
        setExpenseMessage('');

        const client = supabaseClient;
        if (!client || !isAuthReady) {
            setExpenseMessage('Error: Application is not ready or database disconnected.');
            return;
        }

        const { dateOfExpense, category, description, amount } = expenseFormState;

        if (!dateOfExpense || !category || !amount) {
            setExpenseMessage('Please fill in Date, Category, and Amount.');
            return;
        }

        if (amount <= 0) {
            setExpenseMessage('Amount must be a positive number.');
            return;
        }

        try {
            const newEntry = {
                dateOfExpense,
                category,
                description: description.trim(),
                amount: parseFloat(amount),
                recordedBy: userId,
            };

            const { error } = await client.from('expenses').insert([newEntry]).select(); 

            if (error) {
                console.error("Error adding expense document: ", error);
                setExpenseMessage(`Failed to record expense. Error: ${error.message}`);
                return;
            }

            setExpenseFormState(prev => ({
                dateOfExpense: today,
                category: prev.category, // Keep selected category, clear others
                description: '',
                amount: '',
            }));
            setExpenseMessage('Expense entry successfully recorded!');
        } catch (error) {
            console.error("Unexpected error during expense submission: ", error);
            setExpenseMessage(`Failed to record expense. Unexpected error.`);
        }
    }, [expenseFormState, isAuthReady, userId, supabaseClient]);


    // --- Configuration List Manager Component ---

    const ListManager = ({ title, items, tableName, color }) => {
        const [newItem, setNewItem] = useState('');
        const [managerMessage, setManagerMessage] = useState('');
        const client = supabaseClient;

        const handleAdd = async (e) => {
            e.preventDefault();
            setManagerMessage('');
            if (!client) return setManagerMessage('DB not connected.');
            if (newItem.trim() === '') return setManagerMessage('Name cannot be empty.');
            
            const item = newItem.trim();

            try {
                const { error } = await client
                    .from(tableName)
                    .insert([{ name: item }]);
                
                if (error) {
                    // Supabase returns an error code '23505' for unique constraint violation (duplicate)
                    if (error.code === '23505') {
                        setManagerMessage(`Error: "${item}" already exists.`);
                    } else {
                        console.error(`Error adding item to ${tableName}:`, error);
                        setManagerMessage(`Failed to add: ${error.message}`);
                    }
                    return;
                }

                setNewItem('');
                setManagerMessage(`Successfully added "${item}"!`);
            } catch (err) {
                console.error(err);
                setManagerMessage('An unexpected error occurred.');
            }
        };

        const handleDelete = async (id, name) => {
            if (!client) return;
            setManagerMessage('');
            try {
                const { error } = await client
                    .from(tableName)
                    .delete()
                    .eq('id', id);

                if (error) {
                    console.error(`Error deleting item from ${tableName}:`, error);
                    setManagerMessage(`Failed to delete "${name}". Error: ${error.message}`);
                    return;
                }
                setManagerMessage(`Successfully deleted "${name}".`);

            } catch (err) {
                console.error(err);
            }
        };

        return (
            <div className="bg-white p-6 rounded-xl shadow-lg border border-gray-100 mb-8">
                <h3 className={`text-2xl font-bold text-${color}-600 mb-4 border-b pb-2`}>{title}</h3>
                
                <form onSubmit={handleAdd} className="flex gap-2 mb-4">
                    <input
                        type="text"
                        value={newItem}
                        onChange={(e) => {
                            setNewItem(e.target.value);
                            setManagerMessage(''); // Clear message on typing
                        }}
                        className="flex-grow p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-${color}-500"
                        placeholder={`New ${title.split(' ')[1]} Name`}
                        required
                        disabled={!isAuthReady || isConfigLoading}
                    />
                    <button
                        type="submit"
                        className={`px-4 py-3 text-white font-medium rounded-lg shadow-md bg-${color}-500 hover:bg-${color}-600 transition disabled:opacity-50`}
                        disabled={!isAuthReady || isConfigLoading || newItem.trim() === ''}
                    >
                        + Add
                    </button>
                </form>

                {managerMessage && (
                    <div className={`p-2 mb-4 rounded-lg text-sm ${managerMessage.startsWith('Error') ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                        {managerMessage}
                    </div>
                )}

                <div className="max-h-60 overflow-y-auto space-y-2 pr-2">
                    {items.map(item => (
                        <div key={item.id} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg border border-gray-200">
                            <span className="font-medium text-gray-700">{item.name}</span>
                            <button
                                onClick={() => handleDelete(item.id, item.name)}
                                className="text-red-500 hover:text-red-700 text-sm p-1 rounded-full hover:bg-red-100 transition"
                                disabled={!isAuthReady}
                                title={`Delete ${item.name}`}
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                    <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm4 0a1 1 0 10-2 0v6a1 1 0 102 0V8z" clipRule="evenodd" />
                                </svg>
                            </button>
                        </div>
                    ))}
                    {items.length === 0 && !isConfigLoading && (
                        <div className="text-center text-gray-400 p-4 border-dashed border-2 rounded-lg">No items defined. Add one above!</div>
                    )}
                </div>
            </div>
        );
    };

    const ConfigurationScreen = () => (
        <div className="max-w-xl mx-auto">
            <h2 className="text-4xl font-extrabold text-gray-800 mb-6 border-b pb-3">Application Configuration</h2>
            <p className="mb-8 text-gray-600">Define the custom categories and service types used in the main entry screens.</p>

            {isConfigLoading && (
                <div className="text-center py-10 text-gray-500">
                    <svg className="animate-spin mx-auto h-8 w-8 text-gray-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <p className="mt-4">Loading configuration lists...</p>
                </div>
            )}
            {!isConfigLoading && (
                <div className="space-y-8">
                    <ListManager 
                        title="Service Types" 
                        items={dynamicServiceTypes} 
                        tableName="config_services" 
                        color="indigo"
                    />
                    <ListManager 
                        title="Expense Categories" 
                        items={dynamicExpenseCategories} 
                        tableName="config_expenses" 
                        color="pink"
                    />
                </div>
            )}
            
            <p className="mt-8 text-xs text-gray-400 text-center">Changes made here are updated instantly across all tabs.</p>
        </div>
    );

    // --- Other UI Components (Service Form, Expense Form, Lists) ---

    const ServiceEntryForm = () => (
        <div className="w-full bg-white p-6 md:p-8 shadow-2xl rounded-xl border border-gray-100">
            <h2 className="text-3xl font-extrabold text-indigo-700 mb-6 border-b pb-3">Log New Service Job</h2>
            <form onSubmit={handleServiceSubmit} className="space-y-4">
                {/* Car Registration Number */}
                <div>
                    <label htmlFor="regNumber" className="block text-sm font-medium text-gray-700">Car Registration Number</label>
                    <input
                        type="text"
                        name="regNumber"
                        id="regNumber"
                        value={serviceFormState.regNumber}
                        onChange={handleServiceChange}
                        className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm p-3 border focus:border-indigo-500 focus:ring-indigo-500 transition duration-150"
                        placeholder="e.g., K-XYZ 123"
                        required
                    />
                </div>

                {/* Type of Service (Dynamic) */}
                <div>
                    <label htmlFor="serviceType" className="block text-sm font-medium text-gray-700">Type of Service</label>
                    <select
                        name="serviceType"
                        id="serviceType"
                        value={serviceFormState.serviceType}
                        onChange={handleServiceChange}
                        className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm p-3 border bg-white focus:border-indigo-500 focus:ring-indigo-500 transition duration-150 disabled:bg-gray-200"
                        required
                        disabled={dynamicServiceTypes.length === 0}
                    >
                        {dynamicServiceTypes.length > 0 ? (
                            dynamicServiceTypes.map(type => (
                                <option key={type.id} value={type.name}>{type.name}</option>
                            ))
                        ) : (
                            <option value="">{isConfigLoading ? 'Loading types...' : 'No types defined (check Configuration tab)'}</option>
                        )}
                    </select>
                </div>

                {/* Free Text / Notes */}
                <div>
                    <label htmlFor="notes" className="block text-sm font-medium text-gray-700">Service Notes / Free Text</label>
                    <textarea
                        name="notes"
                        id="notes"
                        rows="3"
                        value={serviceFormState.notes}
                        onChange={handleServiceChange}
                        className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm p-3 border focus:border-indigo-500 focus:ring-indigo-500 transition duration-150"
                        placeholder="e.g., Replaced spark plugs and rotated tires."
                    />
                </div>

                {/* Amount, Payment Mode, and Date in 3-column layout (responsive) */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* Amount */}
                    <div>
                        <label htmlFor="amount" className="block text-sm font-medium text-gray-700">Amount (INR)</label>
                        <input
                            type="number"
                            name="amount"
                            id="amount"
                            min="0.01"
                            step="0.01"
                            value={serviceFormState.amount}
                            onChange={handleServiceChange}
                            className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm p-3 border focus:border-indigo-500 focus:ring-indigo-500 transition duration-150"
                            placeholder="0.00"
                            required
                        />
                    </div>

                    {/* Payment Mode */}
                    <div>
                        <label htmlFor="paymentMode" className="block text-sm font-medium text-gray-700">Payment Mode</label>
                        <select
                            name="paymentMode"
                            id="paymentMode"
                            value={serviceFormState.paymentMode}
                            onChange={handleServiceChange}
                            className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm p-3 border bg-white focus:border-indigo-500 focus:ring-indigo-500 transition duration-150"
                            required
                        >
                            {PAYMENT_MODES.map(mode => (
                                <option key={mode} value={mode}>{mode}</option>
                            ))}
                        </select>
                    </div>
                    
                    {/* Date of Service */}
                    <div>
                        <label htmlFor="dateOfService" className="block text-sm font-medium text-gray-700">Date of Service</label>
                        <input
                            type="date"
                            name="dateOfService"
                            id="dateOfService"
                            value={serviceFormState.dateOfService}
                            onChange={handleServiceChange}
                            className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm p-3 border focus:border-indigo-500 focus:ring-indigo-500 transition duration-150"
                            required
                        />
                    </div>
                </div>

                {serviceMessage && (
                    <div className={`p-3 rounded-lg text-sm ${serviceMessage.startsWith('Error') ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                        {serviceMessage}
                    </div>
                )}

                <button
                    type="submit"
                    className="w-full flex justify-center py-3 px-4 border border-transparent rounded-lg shadow-lg text-lg font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition duration-200 ease-in-out disabled:opacity-50"
                    disabled={!isAuthReady || !supabaseClient || dynamicServiceTypes.length === 0}
                >
                    {dynamicServiceTypes.length === 0 ? 'Add Service Types in Configuration' : (isAuthReady && supabaseClient ? 'Submit Service Record' : 'Connecting...')}
                </button>
            </form>
        </div>
    );

    const ServiceList = () => (
        <div className="w-full bg-white p-6 md:p-8 shadow-2xl rounded-xl border border-gray-100">
            <h2 className="text-3xl font-extrabold text-gray-800 mb-6 border-b pb-3">Recent Service History ({services.length})</h2>

            {isLoading ? (
                <div className="text-center py-10 text-gray-500">
                    <svg className="animate-spin mx-auto h-8 w-8 text-indigo-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <p className="mt-4">Loading service history...</p>
                </div>
            ) : services.length === 0 ? (
                <div className="text-center py-10 text-gray-500 border-2 border-dashed p-6 rounded-lg">
                    No service records found. Start by logging a new entry!
                </div>
            ) : (
                <ul className="space-y-4">
                    {services.map((service) => {
                        const formattedServiceDate = service.dateOfService
                            ? new Date(service.dateOfService).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
                            : 'N/A';
                        
                        const loggedTimestamp = service.created_at 
                            ? new Date(service.created_at).toLocaleString() 
                            : 'Processing...';

                        return (
                            <li key={service.id} className="p-4 border-l-4 border-indigo-500 bg-gray-50 rounded-lg transition duration-150 hover:shadow-md">
                                <div className="flex justify-between items-start mb-2">
                                    <h3 className="text-xl font-bold text-gray-800">{service.regNumber}</h3>
                                    <div className="flex space-x-2 items-center">
                                        <span className="text-sm font-semibold text-gray-600">Date: {formattedServiceDate}</span>
                                        <span className={`text-sm font-medium px-3 py-1 rounded-full ${service.paymentMode === 'Card' ? 'bg-blue-200 text-blue-800' : service.paymentMode === 'Cash' ? 'bg-green-200 text-green-800' : 'bg-gray-200 text-gray-800'}`}>
                                            {service.paymentMode}
                                        </span>
                                    </div>
                                </div>
                                <p className="text-base font-semibold text-indigo-600 mb-1">{service.serviceType}</p>
                                <p className="text-2xl font-extrabold text-green-700 mb-2">₹{service.amount ? service.amount.toFixed(2) : 'N/A'}</p>
                                {service.notes && (
                                    <p className="text-sm text-gray-600 border-t pt-2 mt-2">Notes: {service.notes}</p>
                                )}
                                <div className="text-xs text-gray-400 mt-2 flex justify-between">
                                    <p>Recorded By: {service.recordedBy ? `${service.recordedBy.substring(0, 8)}...` : 'N/A'}</p>
                                    <p>Logged: {loggedTimestamp}</p>
                                </div>
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );

    const ExpenseEntryForm = () => (
        <div className="w-full bg-white p-6 md:p-8 shadow-2xl rounded-xl border border-gray-100">
            <h2 className="text-3xl font-extrabold text-pink-700 mb-6 border-b pb-3">Record New Expense</h2>
            <form onSubmit={handleExpenseSubmit} className="space-y-4">
                
                {/* Date and Category in 2-column layout (responsive) */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                     {/* Date of Expense */}
                    <div>
                        <label htmlFor="dateOfExpense" className="block text-sm font-medium text-gray-700">Date of Expense</label>
                        <input
                            type="date"
                            name="dateOfExpense"
                            id="dateOfExpense"
                            value={expenseFormState.dateOfExpense}
                            onChange={handleExpenseChange}
                            className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm p-3 border focus:border-pink-500 focus:ring-pink-500 transition duration-150"
                            required
                        />
                    </div>
                    {/* Category (Dynamic) */}
                    <div>
                        <label htmlFor="category" className="block text-sm font-medium text-gray-700">Expense Category</label>
                        <select
                            name="category"
                            id="category"
                            value={expenseFormState.category}
                            onChange={handleExpenseChange}
                            className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm p-3 border bg-white focus:border-pink-500 focus:ring-pink-500 transition duration-150 disabled:bg-gray-200"
                            required
                            disabled={dynamicExpenseCategories.length === 0}
                        >
                            {dynamicExpenseCategories.length > 0 ? (
                                dynamicExpenseCategories.map(cat => (
                                    <option key={cat.id} value={cat.name}>{cat.name}</option>
                                ))
                            ) : (
                                <option value="">{isConfigLoading ? 'Loading categories...' : 'No categories defined (check Configuration tab)'}</option>
                            )}
                        </select>
                    </div>
                </div>

                {/* Amount */}
                <div>
                    <label htmlFor="expenseAmount" className="block text-sm font-medium text-gray-700">Amount (INR)</label>
                    <input
                        type="number"
                        name="amount"
                        id="expenseAmount"
                        min="0.01"
                        step="0.01"
                        value={expenseFormState.amount}
                        onChange={handleExpenseChange}
                        className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm p-3 border focus:border-pink-500 focus:ring-pink-500 transition duration-150"
                        placeholder="0.00"
                        required
                    />
                </div>

                {/* Description */}
                <div>
                    <label htmlFor="description" className="block text-sm font-medium text-gray-700">Description</label>
                    <textarea
                        name="description"
                        id="description"
                        rows="3"
                        value={expenseFormState.description}
                        onChange={handleExpenseChange}
                        className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm p-3 border focus:border-pink-500 focus:ring-pink-500 transition duration-150"
                        placeholder="e.g., Paid electricity bill for the month of August."
                    />
                </div>

                {expenseMessage && (
                    <div className={`p-3 rounded-lg text-sm ${expenseMessage.startsWith('Error') ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                        {expenseMessage}
                    </div>
                )}

                <button
                    type="submit"
                    className="w-full flex justify-center py-3 px-4 border border-transparent rounded-lg shadow-lg text-lg font-medium text-white bg-pink-600 hover:bg-pink-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-pink-500 transition duration-200 ease-in-out disabled:opacity-50"
                    disabled={!isAuthReady || !supabaseClient || dynamicExpenseCategories.length === 0}
                >
                    {dynamicExpenseCategories.length === 0 ? 'Add Expense Categories in Configuration' : (isAuthReady && supabaseClient ? 'Submit Expense Record' : 'Connecting...')}
                </button>
            </form>
        </div>
    );

    const ExpenseList = () => (
        <div className="w-full bg-white p-6 md:p-8 shadow-2xl rounded-xl border border-gray-100 mt-8">
            <h2 className="text-3xl font-extrabold text-gray-800 mb-6 border-b pb-3">Expense History ({expenses.length})</h2>

            {isExpenseLoading ? (
                <div className="text-center py-10 text-gray-500">
                    <svg className="animate-spin mx-auto h-8 w-8 text-pink-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <p className="mt-4">Loading expense history...</p>
                </div>
            ) : expenses.length === 0 ? (
                <div className="text-center py-10 text-gray-500 border-2 border-dashed p-6 rounded-lg">
                    No expense records found. Start by logging a new entry!
                </div>
            ) : (
                <ul className="space-y-4">
                    {expenses.map((expense) => {
                        const formattedExpenseDate = expense.dateOfExpense
                            ? new Date(expense.dateOfExpense).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
                            : 'N/A';
                        
                        const loggedTimestamp = expense.created_at 
                            ? new Date(expense.created_at).toLocaleString() 
                            : 'Processing...';

                        return (
                            <li key={expense.id} className="p-4 border-l-4 border-pink-500 bg-gray-50 rounded-lg transition duration-150 hover:shadow-md">
                                <div className="flex justify-between items-start mb-2">
                                    <h3 className="text-xl font-bold text-gray-800">{expense.category}</h3>
                                    <div className="flex space-x-2 items-center">
                                        <span className="text-sm font-semibold text-gray-600">Date: {formattedExpenseDate}</span>
                                    </div>
                                </div>
                                <p className="text-base font-semibold text-pink-600 mb-1">{expense.description}</p>
                                <p className="text-2xl font-extrabold text-red-700 mb-2">₹{expense.amount ? expense.amount.toFixed(2) : 'N/A'}</p>
                                
                                <div className="text-xs text-gray-400 mt-2 flex justify-between">
                                    <p>Recorded By: {expense.recordedBy ? `${expense.recordedBy.substring(0, 8)}...` : 'N/A'}</p>
                                    <p>Logged: {loggedTimestamp}</p>
                                </div>
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );


    return (
        <div className="min-h-screen bg-gray-100 p-4 sm:p-8 font-['Inter']">
            {/* Load Supabase library via script tag to avoid module resolution errors */}
            <script src="https://unpkg.com/@supabase/supabase-js@2.44.4/dist/umd/supabase.js"></script>
            {/* Tailwind CSS Script for Inter Font (Loaded via CDN in the canvas environment) */}
            <script src="https://cdn.tailwindcss.com"></script>

            <header className="text-center mb-10">
                <h1 className="text-5xl font-extrabold text-gray-900 drop-shadow-lg">
                    Service Center <span className="text-indigo-600">Manager</span>
                </h1>
                <p className="mt-2 text-lg text-gray-500">Job, Expense, and Configuration Management (Powered by Supabase)</p>
                <p className="mt-4 text-xs text-gray-400">
                    Anonymous User ID: <span className="font-mono text-gray-600">{userId || 'Not signed in'}</span>
                </p>
                <p className="mt-1 text-xs text-red-500">
                    REMINDER: Create the Supabase tables: `jobcarrd`, `expenses`, `config_services`, and `config_expenses`.
                </p>
            </header>

            <div className="max-w-4xl mx-auto">
                 {/* Tab Navigation */}
                <div className="flex justify-center border-b border-gray-300 mb-8 sticky top-0 bg-gray-100 z-10 rounded-xl shadow-lg">
                    <button
                        onClick={() => setActiveTab('service')}
                        className={`px-6 py-3 text-lg font-semibold rounded-t-xl transition-colors duration-200 ${
                            activeTab === 'service' 
                            ? 'border-b-4 border-indigo-600 text-indigo-700 bg-white shadow-inner' 
                            : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200'
                        }`}
                    >
                        Service Entry
                    </button>
                    <button
                        onClick={() => setActiveTab('expense')}
                        className={`px-6 py-3 text-lg font-semibold rounded-t-xl transition-colors duration-200 ${
                            activeTab === 'expense' 
                            ? 'border-b-4 border-pink-600 text-pink-700 bg-white shadow-inner' 
                            : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200'
                        }`}
                    >
                        Expense Tracking
                    </button>
                    <button
                        onClick={() => setActiveTab('config')}
                        className={`px-6 py-3 text-lg font-semibold rounded-t-xl transition-colors duration-200 ${
                            activeTab === 'config' 
                            ? 'border-b-4 border-green-600 text-green-700 bg-white shadow-inner' 
                            : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200'
                        }`}
                    >
                        Configuration
                    </button>
                </div>

                {/* Conditional Content Rendering */}
                {activeTab === 'service' && (
                    <div className="space-y-8">
                        <ServiceEntryForm />
                        <ServiceList />
                    </div>
                )}
                {activeTab === 'expense' && (
                    <div className="space-y-8">
                        <ExpenseEntryForm />
                        <ExpenseList />
                    </div>
                )}
                {activeTab === 'config' && (
                    <ConfigurationScreen />
                )}
            </div>
        </div>
    );
};

export default App;
