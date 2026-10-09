# Real-phone test (before the first Sunday)

The browser tests cannot use a real camera, a real car park or real sunlight. Do this once on real phones, ideally on a weekday, with two or three people. It takes about 30 minutes. Tick each line.

**You need:** a phone for a driver (ideally one Android and one iPhone), a phone for an attendant, the printed signs (or a screen showing one), a team lead's sign-in, and the live address `https://churchparking.online`.

Before you start: the test service is not on in production, so ask the parking lead to add a service that covers the time of the test on the Services screen (and to switch it off afterwards). Remember that a service also holds deploys.

## Drivers
- [ ] Scan a car park sign with the phone's own camera app. It opens the check-in for that car park (the name on screen is right).
- [ ] On the home page, tap **Check in**, then choose a car park. It opens the same page as the sign.
- [ ] On the home page, tap **Scan a car park sign**, allow the camera, and scan a sign. It opens that car park.
- [ ] Scan something that is not a sign (a pass QR, or any other QR). It is refused with a plain message.
- [ ] Check in as a guest with a real plate. A pass with a QR appears. Turn the brightness down and up: the QR is easy to read.
- [ ] Close the browser, open `churchparking.online/c/<car park>` again. The pass is offered ("You already have a pass").
- [ ] Turn on aeroplane mode, tap Check in, turn it off, and tap again. You get the same pass, not an error.
- [ ] Check in a second car on the same phone. Both passes still show their QR.
- [ ] Sign in as a member on a second phone. Your pass shows its QR there too.
- [ ] Tap "Save your details" after a guest check-in, choose a PIN. The pass stays the same.

## Attendants
- [ ] Open `churchparking.online/staff`, sign in, and install it to the home screen ("Church Parking Team"). It opens on the team home page.
- [ ] Choose which car park you are at. Close and reopen the app: it is still chosen.
- [ ] Scan a driver's pass in bright light and in the shade. The camera finds it in about a second or two.
- [ ] Scan a pass from a different car park than the one you chose. A yellow warning names both car parks. **Move to this car park** changes it and the card updates.
- [ ] Release a car. The card says it was released. Scan the same pass again: it says it has already been released and by whom.
- [ ] Tap **Does not match** on a car. A second attendant scanning it sees **On hold** and cannot release it. A team lead clears it with a reason.
- [ ] Look a car up by plate, by phone and by reference, with no pass.

## Team leads
- [ ] The Live Board shows the new check-ins and releases within a few seconds, on a second phone.
- [ ] Alerts appear for a hold and for a second check-in of the same car.
- [ ] After the service, the sweep lists the cars still here.

## Admin
- [ ] Print a car park sign and the general sign (A4). Scan each printed sign from about 1.5 m in daylight.
- [ ] The Reports screen counts match what you did.

## Afterwards
- [ ] Switch off the test service. Delete or close any test visits (Reports shows them; the sweep closes them).
- [ ] Write down anything that felt slow or confusing: it is more useful than any score.
