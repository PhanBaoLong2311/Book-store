const express = require('express');
const moment = require('moment');
const request = require('request');
const Order = require('./order.model');
const { createAOrder, getOrderByEmail, createPaymentUrl, handlePaymentReturn } = require('./order.controller');

const router = express.Router();

// Create order
router.post('/', createAOrder);

// Get orders by user email
router.get('/email/:email', getOrderByEmail);

router.post('/create_payment_url', async function (req, res, next) {
    
  let order_Id = req.body.orderId;
  let order = await Order.findById(order_Id);
  process.env.TZ = 'Asia/Ho_Chi_Minh';
  
  let date = new Date();
  let createDate = moment(date).format('YYYYMMDDHHmmss');
  
  let ipAddr = req.headers['x-forwarded-for'] ||
      req.connection.remoteAddress ||
      req.socket.remoteAddress ||
      req.connection.socket.remoteAddress;
  
  let tmnCode = process.env.VN_PAY_TMNCODE;
  let secretKey = process.env.VN_PAY_HASHSECRET;
  let vnpUrl = process.env.VN_PAY_URL;
  let returnUrl = process.env.VN_PAY_RETURN_URL;
  let orderId = moment(date).format('DDHHmmss');
  let amount = order.totalPrice;
  let bankCode = req.body.bankCode;
  
  let locale = req.body.language;
  if(locale === null || locale === ''){
      locale = 'vn';
  }
  let currCode = 'VND';
  let vnp_Params = {};
  vnp_Params['vnp_Version'] = '2.1.0';
  vnp_Params['vnp_Command'] = 'pay';
  vnp_Params['vnp_TmnCode'] = tmnCode;
  vnp_Params['vnp_Locale'] = locale;
  vnp_Params['vnp_CurrCode'] = currCode;
  vnp_Params['vnp_TxnRef'] = orderId;
  vnp_Params['vnp_OrderInfo'] = 'Thanh toan cho ma GD:' + order_Id;
  vnp_Params['vnp_OrderType'] = 'other';
  vnp_Params['vnp_Amount'] = amount * 100;
  vnp_Params['vnp_ReturnUrl'] = returnUrl;
  vnp_Params['vnp_IpAddr'] = ipAddr;
  vnp_Params['vnp_CreateDate'] = createDate;
  if(bankCode !== null && bankCode !== ''){
      vnp_Params['vnp_BankCode'] = bankCode;
  }

  vnp_Params = sortObject(vnp_Params);

  let querystring = require('qs');
  let signData = querystring.stringify(vnp_Params, { encode: false });
  let crypto = require("crypto");     
  let hmac = crypto.createHmac("sha512", secretKey);
  let signed = hmac.update(new Buffer(signData, 'utf-8')).digest("hex"); 
  vnp_Params['vnp_SecureHash'] = signed;
  vnpUrl += '?' + querystring.stringify(vnp_Params, { encode: false });

  // res.redirect(vnpUrl)
  res.status(200).json({ url: vnpUrl });
});

router.get('/payment/vnpay_return', async function (req, res, next) {
  let vnp_Params = req.query;

  let secureHash = vnp_Params['vnp_SecureHash'];

  delete vnp_Params['vnp_SecureHash'];
  delete vnp_Params['vnp_SecureHashType'];
  const orderInfo = vnp_Params['vnp_OrderInfo'];
  const orderId = orderInfo.split(':')[1].trim();
  let order = await Order.findById(orderId);

  vnp_Params = sortObject(vnp_Params);

  let tmnCode = process.env.VN_PAY_TMNCODE;
  let secretKey = process.env.VN_PAY_HASHSECRET;

  let querystring = require('qs');
  let signData = querystring.stringify(vnp_Params, { encode: false });
  let crypto = require("crypto");     
  let hmac = crypto.createHmac("sha512", secretKey);
  let signed = hmac.update(new Buffer(signData, 'utf-8')).digest("hex");     
  let fe_url=process.env.FE_URL;
  let status = 'failed';
  if(vnp_Params['vnp_ResponseCode'] === '00'){
    //đổi trạng thái đơn hàng
    order.paymentStatus = 'Paid';
    status = 'success';
    await order.save();
  }
  else{
    order.paymentStatus = 'Failed';
    await order.save();
  }
  if(secureHash === signed){
      //Kiem tra xem du lieu trong db co hop le hay khong va thong bao ket qua

      //res.render('success', {code: vnp_Params['vnp_ResponseCode']})
      res.redirect(`${fe_url}/orders?status=${status}&orderId=${orderId}`);
    } else{
      //res.render('success', {code: '97'})
      res.redirect(`${fe_url}/orders?status=failed`);
  }
});
function sortObject(obj) {
	let sorted = {};
	let str = [];
	let key;
	for (key in obj){
		if (obj.hasOwnProperty(key)) {
		str.push(encodeURIComponent(key));
		}
	}
	str.sort();
    for (key = 0; key < str.length; key++) {
        sorted[str[key]] = encodeURIComponent(obj[str[key]]).replace(/%20/g, "+");
    }
    return sorted;
}
module.exports = router;
