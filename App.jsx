import React, { useState, useEffect, useCallback, useMemo } from 'react';
// Supabase library will be loaded globally via a <script> tag in the JSX output.

// --- Supabase Configuration and Initialization ---
const SUPABASE_CONFIG = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
// IMPORTANT: These variables must be populated in the environment configuration
const SUPABASE_URL = "https://cfcpnnmjplvvvyqqavhl.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNmY3Bubm1qcGx2dnZ5cXFhdmhsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIwMDI4NjAsImV4cCI6MjA3NzU3ODg2MH0.071ejF4irIn9M2a8AkKEifiTebVg5ACP4uOfE4F2YiM";

// Function to generate a stable, temporary user ID (mocking anonymous auth)
const getAnonymousUserId = () => {
    // Uses __app_id for stability in the environment
    return typeof __app_id !== 'undefined' ? `${__app_id}-anon-user` : 'anon-default-user';
};

// Get today's date in YYYY-MM-DD format for default value
const today = new Date().toISOString().split('T')[0];

// Fixed constants for payment mode 
const PAYMENT_MODES = ['Card', 'Cash', 'Bank Transfer', 'Mobile Pay'];

// ----------------------------------------------------------------------
// --- MEMOIZED CHILD COMPONENTS (Service/Expense Forms & Lists) ---
// ----------------------------------------------------------------------

// 1. Memoized Configuration List Manager
// Prevents re-renders unless its props change.
const ListManager = React.memo(({ title, items, tableName, color, supabaseClient, fetchConfigAndSubscribe, isAuthReady, isConfigLoading, connectionError }) => {
    const [newItem, setNewItem] = useState('');
    const [managerMessage, setManagerMessage] = useState('');

    const handleAdd = useCallback(async (e) => {
        e.preventDefault();
        setManagerMessage('');
        if (!supabaseClient) return setManagerMessage('DB not connected.');
        if (newItem.trim() === '') return setManagerMessage('Name cannot be empty.');
        
        const item = newItem.trim();

        try {
            const { error } = await supabaseClient
                .from(tableName)
                .insert([{ name: item }]);
            
            if (error) {
                if (error.code === '23505') {
                    setManagerMessage(`Error: "${item}" already exists.`);
                } else {
                    console.error(`Error adding item to ${tableName}:`, error);
                    setManagerMessage(`Failed to add: ${error.message}. Check RLS/Schema.`);
                }
                return;
            }

            setNewItem('');
            setManagerMessage(`Successfully added "${item}"!`);
            // Trigger a re-fetch of the config list
            fetchConfigAndSubscribe(supabaseClient);
        } catch (err) {
            console.error(err);
            setManagerMessage('An unexpected error occurred.');
        }
    }, [newItem, supabaseClient, tableName, fetchConfigAndSubscribe]);

    const handleDelete = useCallback(async (id, name) => {
        if (!supabaseClient) return;
        setManagerMessage('');
        try {
            const { error } = await supabaseClient
                .from(tableName)
                .delete()
                .eq('id', id);

            if (error) {
                console.error(`Error deleting item from ${tableName}:`, error);
                setManagerMessage(`Failed to delete "${name}". Error: ${error.message}. Check RLS/Schema.`);
                return;
            }
            setManagerMessage(`Successfully deleted "${name}".`);
            // Trigger a re-fetch of the config list
            fetchConfigAndSubscribe(supabaseClient);

        } catch (err) {
            console.error(err);
        }
    }, [supabaseClient, tableName, fetchConfigAndSubscribe]);

    return (
        <div className="bg-white p-6 rounded-xl shadow-lg border border-gray-100 mb-8">
            <h3 className={`text-2xl font-bold text-${color}-600 mb-4 border-b pb-2`}>{title}</h3>
            
            <form onSubmit={handleAdd} className="flex gap-2 mb-4">
                <input
                    type="text"
                    value={newItem}
                    onChange={(e) => {
                        setNewItem(e.target.value);
                        setManagerMessage('');
                    }}
                    className={`flex-grow p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-${color}-500`}
                    placeholder={`New ${title.split(' ')[1]} Name`}
                    required
                    disabled={!isAuthReady || isConfigLoading || !!connectionError}
                />
                <button
                    type="submit"
                    className={`px-4 py-3 text-white font-medium rounded-lg shadow-md bg-${color}-500 hover:bg-${color}-600 transition disabled:opacity-50`}
                    disabled={!isAuthReady || isConfigLoading || newItem.trim() === '' || !!connectionError}
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
});


// 2. Memoized Service Entry Form Component
// Focus fix: This component only re-renders when formState, onChange, onSubmit, or dynamicServiceTypes change.
const ServiceEntryForm = React.memo(({ formState, onChange, onSubmit, dynamicServiceTypes, isConfigLoading, isAuthReady, connectionError, serviceMessage }) => {
    
    // Memoized value for button text calculation
    const buttonText = useMemo(() => {
        if (connectionError) return 'Database Error: Fix Config First';
        if (dynamicServiceTypes.length === 0) return 'Add Service Types in Configuration';
        if (isAuthReady) return 'Submit Service Record';
        return 'Connecting...';
    }, [connectionError, dynamicServiceTypes.length, isAuthReady]);

    return (
        <div className="w-full bg-white p-6 md:p-8 shadow-2xl rounded-xl border border-gray-100">
            <h2 className="text-3xl font-extrabold text-indigo-700 mb-6 border-b pb-3">Log New Service Job</h2>
            <form onSubmit={onSubmit} className="space-y-4">
                {/* Car Registration Number */}
                <div>
                    <label htmlFor="regNumber" className="block text-sm font-medium text-gray-700">Car Registration Number</label>
                    <input
                        type="text"
                        name="regNumber"
                        id="regNumber"
                        value={formState.regNumber}
                        onChange={onChange}
                        className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm p-3 border focus:border-indigo-500 focus:ring-indigo-500 transition duration-150"
                        placeholder="e.g., K-XYZ 123"
                        required
                        disabled={!!connectionError}
                    />
                </div>

                {/* Type of Service (Dynamic) */}
                <div>
                    <label htmlFor="serviceType" className="block text-sm font-medium text-gray-700">Type of Service</label>
                    <select
                        name="serviceType"
                        id="serviceType"
                        value={formState.serviceType}
                        onChange={onChange}
                        className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm p-3 border bg-white focus:border-indigo-500 focus:ring-indigo-500 transition duration-150 disabled:bg-gray-200"
                        required
                        disabled={dynamicServiceTypes.length === 0 || !!connectionError}
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
                        value={formState.notes}
                        onChange={onChange}
                        className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm p-3 border focus:border-indigo-500 focus:ring-indigo-500 transition duration-150"
                        placeholder="e.g., Replaced spark plugs and rotated tires."
                        disabled={!!connectionError}
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
                            value={formState.amount}
                            onChange={onChange}
                            className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm p-3 border focus:border-indigo-500 focus:ring-indigo-500 transition duration-150"
                            placeholder="0.00"
                            required
                            disabled={!!connectionError}
                        />
                    </div>

                    {/* Payment Mode */}
                    <div>
                        <label htmlFor="paymentMode" className="block text-sm font-medium text-gray-700">Payment Mode</label>
                        <select
                            name="paymentMode"
                            id="paymentMode"
                            value={formState.paymentMode}
                            onChange={onChange}
                            className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm p-3 border bg-white focus:border-indigo-500 focus:ring-indigo-500 transition duration-150"
                            required
                            disabled={!!connectionError}
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
                            value={formState.dateOfService}
                            onChange={onChange}
                            className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm p-3 border focus:border-indigo-500 focus:ring-indigo-500 transition duration-150"
                            required
                            disabled={!!connectionError}
                        />
                    </div>
                </div>

                {serviceMessage && (
                    <div className={`p-3 rounded-lg text-sm ${serviceMessage.startsWith('Error') || connectionError ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                        {serviceMessage}
                    </div>
                )}

                <button
                    type="submit"
                    className="w-full flex justify-center py-3 px-4 border border-transparent rounded-lg shadow-lg text-lg font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition duration-200 ease-in-out disabled:opacity-50"
                    disabled={!isAuthReady || dynamicServiceTypes.length === 0 || !!connectionError}
                >
                    {buttonText}
                </button>
            </form>
        </div>
    );
});


// 3. Memoized Expense Entry Form Component
// Focus fix: This component only re-renders when formState, onChange, onSubmit, or dynamicExpenseCategories change.
const ExpenseEntryForm = React.memo(({ formState, onChange, onSubmit, dynamicExpenseCategories, isConfigLoading, isAuthReady, connectionError, expenseMessage }) => {

    // Memoized value for button text calculation
    const buttonText = useMemo(() => {
        if (connectionError) return 'Database Error: Fix Config First';
        if (dynamicExpenseCategories.length === 0) return 'Add Expense Categories in Configuration';
        if (isAuthReady) return 'Submit Expense Record';
        return 'Connecting...';
    }, [connectionError, dynamicExpenseCategories.length, isAuthReady]);

    return (
        <div className="w-full bg-white p-6 md:p-8 shadow-2xl rounded-xl border border-gray-100">
            <h2 className="text-3xl font-extrabold text-pink-700 mb-6 border-b pb-3">Record New Expense</h2>
            <form onSubmit={onSubmit} className="space-y-4">
                
                {/* Date and Category in 2-column layout (responsive) */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                     {/* Date of Expense */}
                    <div>
                        <label htmlFor="dateOfExpense" className="block text-sm font-medium text-gray-700">Date of Expense</label>
                        <input
                            type="date"
                            name="dateOfExpense"
                            id="dateOfExpense"
                            value={formState.dateOfExpense}
                            onChange={onChange}
                            className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm p-3 border focus:border-pink-500 focus:ring-pink-500 transition duration-150"
                            required
                            disabled={!!connectionError}
                        />
                    </div>
                    {/* Category (Dynamic) */}
                    <div>
                        <label htmlFor="category" className="block text-sm font-medium text-gray-700">Expense Category</label>
                        <select
                            name="category"
                            id="category"
                            value={formState.category}
                            onChange={onChange}
                            className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm p-3 border bg-white focus:border-pink-500 focus:ring-pink-500 transition duration-150 disabled:bg-gray-200"
                            required
                            disabled={dynamicExpenseCategories.length === 0 || !!connectionError}
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
                        value={formState.amount}
                        onChange={onChange}
                        className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm p-3 border focus:border-pink-500 focus:ring-pink-500 transition duration-150"
                        placeholder="0.00"
                        required
                        disabled={!!connectionError}
                    />
                </div>

                {/* Description */}
                <div>
                    <label htmlFor="description" className="block text-sm font-medium text-gray-700">Description</label>
                    <textarea
                        name="description"
                        id="description"
                        rows="3"
                        value={formState.description}
                        onChange={onChange}
                        className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm p-3 border focus:border-pink-500 focus:ring-pink-500 transition duration-150"
                        placeholder="e.g., Paid electricity bill for the month of August."
                        disabled={!!connectionError}
                    />
                </div>

                {expenseMessage && (
                    <div className={`p-3 rounded-lg text-sm ${expenseMessage.startsWith('Error') || connectionError ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                        {expenseMessage}
                    </div>
                )}

                <button
                    type="submit"
                    className="w-full flex justify-center py-3 px-4 border border-transparent rounded-lg shadow-lg text-lg font-medium text-white bg-pink-600 hover:bg-pink-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-pink-500 transition duration-200 ease-in-out disabled:opacity-50"
                    disabled={!isAuthReady || dynamicExpenseCategories.length === 0 || !!connectionError}
                >
                    {buttonText}
                </button>
            </form>
        </div>
    );
});


// 4. Memoized Service List Component (Fix for stray semicolon applied here)
const ServiceList = React.memo(({ services, isLoading, connectionError }) => (
    <div className="w-full bg-white p-6 md:p-8 shadow-2xl rounded-xl border border-gray-100">
        <h2 className="text-3xl font-extrabold text-gray-800 mb-6 border-b pb-3">Recent Service History ({services.length})</h2>

        {connectionError ? (
            <div className="text-center py-10 text-red-500 border-2 border-dashed p-6 rounded-lg">
                Cannot load services due to connection error. See status above.
            </div>
        ) : isLoading ? (
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
                    ) 
                })}
            </ul>
        )}
    </div>
));


// 5. Memoized Expense List Component (Fix for stray semicolon applied here)
const ExpenseList = React.memo(({ expenses, isExpenseLoading, connectionError }) => (
    <div className="w-full bg-white p-6 md:p-8 shadow-2xl rounded-xl border border-gray-100 mt-8">
        <h2 className="text-3xl font-extrabold text-gray-800 mb-6 border-b pb-3">Expense History ({expenses.length})</h2>

        {connectionError ? (
            <div className="text-center py-10 text-red-500 border-2 border-dashed p-6 rounded-lg">
                Cannot load expenses due to connection error. See status above.
            </div>
        ) : isExpenseLoading ? (
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
                    ) 
                })}
            </ul>
        )}
    </div>
));


// ----------------------------------------------------------------------
// --- MAIN APP COMPONENT ---
// ----------------------------------------------------------------------

const App = () => {
    // --- DEBUG & CONNECTION STATE ---
    const [activeTab, setActiveTab] = useState('service');
    const [supabaseClient, setSupabaseClient] = useState(null);
    const [userId, setUserId] = useState(null);
    const [isAuthReady, setIsAuthReady] = useState(false);
    const [connectionError, setConnectionError] = useState(null);

    // Dynamic Configuration States
    const [dynamicServiceTypes, setDynamicServiceTypes] = useState([]);
    const [dynamicExpenseCategories, setDynamicExpenseCategories] = useState([]);
    const [isConfigLoading, setIsConfigLoading] = useState(true);

    // Service Data States
    const initialServiceFormState = useMemo(() => ({
        regNumber: '',
        serviceType: '', 
        notes: '',
        amount: '',
        paymentMode: 'Cash',
        dateOfService: today,
    }), []);

    const [serviceFormState, setServiceFormState] = useState(initialServiceFormState);
    const [services, setServices] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [serviceMessage, setServiceMessage] = useState('');

    // Expense Data States
    const initialExpenseFormState = useMemo(() => ({
        category: '', 
        description: '',
        amount: '',
        dateOfExpense: today,
    }), []);

    const [expenseFormState, setExpenseFormState] = useState(initialExpenseFormState);
    const [expenses, setExpenses] = useState([]);
    const [isExpenseLoading, setIsExpenseLoading] = useState(false);
    const [expenseMessage, setExpenseMessage] = useState('');


    // --- Supabase and Auth Initialization ---
    useEffect(() => {
        if (typeof window.supabase !== 'undefined' && SUPABASE_URL && SUPABASE_ANON_KEY) {
            try {
                // Debug: Log Supabase URL and Key
                console.log('SUPABASE_URL:', SUPABASE_URL);
                console.log('SUPABASE_ANON_KEY:', SUPABASE_ANON_KEY);
                // Initialize client globally using the window object for simplicity in single-file JSX
                const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
                setSupabaseClient(client);

                // Mock Authentication (using a stable ID)
                const mockUserId = getAnonymousUserId();
                setUserId(mockUserId);
                setIsAuthReady(true);
                setConnectionError(null);
                
            } catch (error) {
                console.error("Supabase initialization failed:", error);
                setConnectionError("Supabase initialization failed. Check URL/Key/Imports.");
            }
        } else {
            setConnectionError("Supabase client is not loaded or config is incomplete.");
        }
    }, []);


    // --- Dynamic Config Fetching and Realtime Subscription (Services/Categories) ---
    const fetchConfigAndSubscribe = useCallback((client) => {
        if (!client || !isAuthReady) return;
        setIsConfigLoading(true);

        // Fetch Service Types
        client
            .from('config_services')
            .select('*')
            .order('name', { ascending: true })
            .then(({ data, error }) => {
                if (error) {
                    console.error("Error fetching service types:", error);
                    return;
                }
                setDynamicServiceTypes(data);
                // Set default form value if needed
                if (data.length > 0 && serviceFormState.serviceType === '') {
                    setServiceFormState(prev => ({ ...prev, serviceType: data[0].name }));
                }
            });

        // Fetch Expense Categories
        client
            .from('expense_categories')
            .select('*')
            .order('name', { ascending: true })
            .then(({ data, error }) => {
                if (error) {
                    console.error("Error fetching expense categories:", error);
                    return;
                }
                setDynamicExpenseCategories(data);
                // Set default form value if needed
                if (data.length > 0 && expenseFormState.category === '') {
                    setExpenseFormState(prev => ({ ...prev, category: data[0].name }));
                }
            })
            .finally(() => setIsConfigLoading(false));

    }, [isAuthReady, serviceFormState.serviceType, expenseFormState.category]); 

    // Initial config load
    useEffect(() => {
        if (supabaseClient && isAuthReady) {
            fetchConfigAndSubscribe(supabaseClient);
        }
    }, [supabaseClient, isAuthReady, fetchConfigAndSubscribe]);


    // --- Service History Fetching and Realtime Subscription ---
    const fetchServiceAndSubscribe = useCallback((client) => {
        if (!client || !isAuthReady) return;
        setIsLoading(true);

        // Function to fetch latest data
        const fetchLatest = () => client
            .from('services')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(50);

        fetchLatest().then(({ data, error }) => {
            if (error) {
                console.error("Error fetching services:", error);
                return;
            }
            setServices(data || []);
            setIsLoading(false);
        });

        // Realtime Subscription
        const channel = client
            .channel('services_changes')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'services' },
                () => {
                    fetchLatest().then(({ data: newData }) => {
                        setServices(newData || []);
                    });
                }
            )
            .subscribe((status, err) => {
                if (status === 'CHANNEL_ERROR') {
                    console.error("Services channel error:", err);
                }
            });

        // Cleanup function
        return () => {
            client.removeChannel(channel);
        };
    }, [isAuthReady]);

    useEffect(() => {
        if (supabaseClient && isAuthReady) {
            return fetchServiceAndSubscribe(supabaseClient);
        }
    }, [supabaseClient, isAuthReady, fetchServiceAndSubscribe]);


    // --- Expense History Fetching and Realtime Subscription ---
    const fetchExpensesAndSubscribe = useCallback((client) => {
        if (!client || !isAuthReady) return;
        setIsExpenseLoading(true);

        // Function to fetch latest data
        const fetchLatest = () => client
            .from('expenses')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(50);

        fetchLatest().then(({ data, error }) => {
            if (error) {
                console.error("Error fetching expenses:", error);
                return;
            }
            setExpenses(data || []);
            setIsExpenseLoading(false);
        });

        // Realtime Subscription
        const channel = client
            .channel('expenses_changes')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'expenses' },
                () => {
                    fetchLatest().then(({ data: newData }) => {
                        setExpenses(newData || []);
                    });
                }
            )
            .subscribe((status, err) => {
                if (status === 'CHANNEL_ERROR') {
                    console.error("Expenses channel error:", err);
                }
            });

        // Cleanup function
        return () => {
            client.removeChannel(channel);
        };
    }, [isAuthReady]);

    useEffect(() => {
        if (supabaseClient && isAuthReady) {
            return fetchExpensesAndSubscribe(supabaseClient);
        }
    }, [supabaseClient, isAuthReady, fetchExpensesAndSubscribe]);


    // --- Service Form Handlers (Stable via useCallback) ---
    const handleServiceChange = useCallback((e) => {
        const { name, value } = e.target;
        setServiceFormState(prev => ({
            ...prev,
            // Convert amount to a number, but keep it as a string if empty for controlled input
            [name]: name === 'amount' ? (value === '' ? '' : parseFloat(value)) : value,
        }));
    }, []);

    const handleServiceSubmit = useCallback(async (e) => {
        e.preventDefault();
        setServiceMessage('');
        if (!isAuthReady || !supabaseClient) return setServiceMessage('Error: App not authenticated or database not connected.');
        
        // Basic validation
        if (serviceFormState.amount === '' || serviceFormState.amount <= 0 || serviceFormState.regNumber.trim() === '') {
            setServiceMessage('Error: Please fill in all required fields (Reg No, Service Type, Amount).');
            return;
        }

        const newRecord = {
            ...serviceFormState,
            regNumber: serviceFormState.regNumber.toUpperCase().trim(),
            recordedBy: userId,
        };

        try {
            const { error } = await supabaseClient
                .from('services')
                .insert([newRecord]);

            if (error) {
                console.error('Error submitting service record:', error);
                setServiceMessage(`Error submitting record: ${error.message}. Check RLS/Schema.`);
                return;
            }

            setServiceFormState(initialServiceFormState);
            setServiceMessage('Service record submitted successfully!');

        } catch (err) {
            console.error('Unexpected submission error:', err);
            setServiceMessage('An unexpected error occurred during submission.');
        }
    }, [serviceFormState, isAuthReady, userId, supabaseClient, initialServiceFormState]);


    // --- Expense Form Handlers (Stable via useCallback) ---
    const handleExpenseChange = useCallback((e) => {
        const { name, value } = e.target;
        setExpenseFormState(prev => ({
            ...prev,
            [name]: name === 'amount' ? (value === '' ? '' : parseFloat(value)) : value,
        }));
    }, []);

    const handleExpenseSubmit = useCallback(async (e) => {
        e.preventDefault();
        setExpenseMessage('');
        if (!isAuthReady || !supabaseClient) return setExpenseMessage('Error: App not authenticated or database not connected.');

        // Basic validation
        if (expenseFormState.amount === '' || expenseFormState.amount <= 0 || expenseFormState.category.trim() === '') {
            setExpenseMessage('Error: Please fill in the Category and Amount fields.');
            return;
        }

        const newRecord = {
            ...expenseFormState,
            recordedBy: userId,
        };

        try {
            const { error } = await supabaseClient
                .from('expenses')
                .insert([newRecord]);

            if (error) {
                console.error('Error submitting expense record:', error);
                setExpenseMessage(`Error submitting record: ${error.message}. Check RLS/Schema.`);
                return;
            }

            setExpenseFormState(initialExpenseFormState);
            setExpenseMessage('Expense record submitted successfully!');

        } catch (err) {
            console.error('Unexpected submission error:', err);
            setExpenseMessage('An unexpected error occurred during submission.');
        }
    }, [expenseFormState, isAuthReady, userId, supabaseClient, initialExpenseFormState]);


    // --- Configuration Screen Component (Fully included now) ---
    const ConfigurationScreen = () => (
        <div className="p-4 space-y-8">
            <h2 className="text-3xl font-extrabold text-gray-800 border-b pb-4 mb-4">Service Center Configuration</h2>
            <div className="grid md:grid-cols-2 gap-8">
                <ListManager
                    title="Service Types"
                    items={dynamicServiceTypes}
                    tableName="config_services"
                    color="indigo"
                    supabaseClient={supabaseClient}
                    fetchConfigAndSubscribe={fetchConfigAndSubscribe}
                    isAuthReady={isAuthReady}
                    isConfigLoading={isConfigLoading}
                    connectionError={connectionError}
                />
                <ListManager
                    title="Expense Categories"
                    items={dynamicExpenseCategories}
                    tableName="expense_categories"
                    color="pink"
                    supabaseClient={supabaseClient}
                    fetchConfigAndSubscribe={fetchConfigAndSubscribe}
                    isAuthReady={isAuthReady}
                    isConfigLoading={isConfigLoading}
                    connectionError={connectionError}
                />
            </div>
            
            <div className="p-6 bg-yellow-50 rounded-xl border border-yellow-200 text-sm text-yellow-800">
                <h3 className="font-bold text-lg mb-2">Important Setup Note:</h3>
                <p>Before you can add records, you must define at least one **Service Type** and one **Expense Category** here. Changes update instantly. These tables require a simple schema: `id` (primary key, auto-increment), `name` (text, unique), and `created_at` (timestamp, default now()).</p>
                <p className="mt-2 font-semibold">Current Anonymous User ID: <span className="text-gray-900 break-all">{userId || 'Loading...'}</span></p>
            </div>
        </div>
    );


    return (
        <div className="min-h-screen bg-gray-100 p-4 sm:p-8 font-['Inter']">
            {/* Load Supabase library via script tag to avoid module resolution errors */}
            <script src="https://unpkg.com/@supabase/supabase-js@2.44.4/dist/umd/supabase.js"></script>
            {/* Tailwind CSS Script is assumed to be loaded */}

            <header className="text-center mb-10">
                <h1 className="text-4xl font-extrabold text-gray-900">
                    <span className="text-indigo-600">Service Center</span> Management
                </h1>
                <p className="text-lg text-gray-500 mt-2">Log Services, Expenses, and Track Income (INR)</p>
                
                {/* Connection Status Indicator */}
                <div className={`mt-4 inline-flex items-center px-4 py-2 text-sm font-medium rounded-full ${
                    isAuthReady && !connectionError ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                }`}>
                    {isAuthReady && !connectionError ? 'Database Connected & Ready' : connectionError || 'Connecting...'}
                </div>
                {connectionError && (
                    <p className="text-sm text-red-500 mt-2 max-w-lg mx-auto break-all">
                        Error Detail: {connectionError}
                    </p>
                )}
            </header>

            <div className="max-w-4xl mx-auto">
                 {/* Tab Navigation */}
                <div className="flex justify-center border-b border-gray-300 mb-8 sticky top-0 bg-gray-100 z-10 rounded-xl shadow-lg">
                    <button
                        onClick={() => setActiveTab('service')}
                        className={`py-3 px-6 text-lg font-medium transition-colors duration-200 ${
                            activeTab === 'service' ? 'text-indigo-600 border-b-2 border-indigo-600 bg-white shadow-t-lg' : 'text-gray-500 hover:text-indigo-500'
                        }`}
                    >
                        New Service
                    </button>
                    <button
                        onClick={() => setActiveTab('expense')}
                        className={`py-3 px-6 text-lg font-medium transition-colors duration-200 ${
                            activeTab === 'expense' ? 'text-pink-600 border-b-2 border-pink-600 bg-white shadow-t-lg' : 'text-gray-500 hover:text-pink-500'
                        }`}
                    >
                        New Expense
                    </button>
                    <button
                        onClick={() => setActiveTab('config')}
                        className={`py-3 px-6 text-lg font-medium transition-colors duration-200 ${
                            activeTab === 'config' ? 'text-gray-800 border-b-2 border-gray-800 bg-white shadow-t-lg' : 'text-gray-500 hover:text-gray-700'
                        }`}
                    >
                        Configuration
                    </button>
                </div>

                {/* Conditional Content Rendering */}
                {activeTab === 'service' && (
                    <div className="space-y-8">
                        {/* Now using the memoized ServiceEntryForm component */}
                        <ServiceEntryForm 
                            formState={serviceFormState}
                            onChange={handleServiceChange}
                            onSubmit={handleServiceSubmit}
                            dynamicServiceTypes={dynamicServiceTypes}
                            isConfigLoading={isConfigLoading}
                            isAuthReady={isAuthReady}
                            connectionError={connectionError}
                            serviceMessage={serviceMessage}
                        />
                         {/* Now using the memoized ServiceList component */}
                        <ServiceList 
                            services={services}
                            isLoading={isLoading}
                            connectionError={connectionError}
                        />
                    </div>
                )}
                {activeTab === 'expense' && (
                    <div className="space-y-8">
                        {/* Now using the memoized ExpenseEntryForm component */}
                        <ExpenseEntryForm 
                            formState={expenseFormState}
                            onChange={handleExpenseChange}
                            onSubmit={handleExpenseSubmit}
                            dynamicExpenseCategories={dynamicExpenseCategories}
                            isConfigLoading={isConfigLoading}
                            isAuthReady={isAuthReady}
                            connectionError={connectionError}
                            expenseMessage={expenseMessage}
                        />
                         {/* Now using the memoized ExpenseList component */}
                        <ExpenseList 
                            expenses={expenses}
                            isExpenseLoading={isExpenseLoading}
                            connectionError={connectionError}
                        />
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
