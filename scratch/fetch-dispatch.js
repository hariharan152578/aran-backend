// fetch is global in modern Node

async function run() {
  try {
    const res = await fetch('http://localhost:5000/api/dispatch/orders');
    const json = await res.json();
    console.log('Backend response status:', res.status);
    console.log('Backend orders count:', json.length);
    console.log('Orders details:');
    json.forEach(o => {
      console.log(`- ${o.dispatchNumber}: status=${o.status}, customerName=${o.customerName}`);
    });
  } catch (err) {
    console.error('Error fetching dispatch orders from backend:', err);
  }
}
run();
