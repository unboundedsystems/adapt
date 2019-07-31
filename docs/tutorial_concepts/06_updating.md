# Step 6: Updating your deployment

<!-- START doctoc generated TOC please keep comment here to allow auto update -->
<!-- DON'T EDIT THIS SECTION, INSTEAD RE-RUN doctoc TO UPDATE -->
## Table of Contents

- [Writing the REST API code](#writing-the-rest-api-code)
- [Update!](#update)
- [Test the API](#test-the-api)
- [Change and Repeat](#change-and-repeat)
- [Next Step](#next-step)

<!-- END doctoc generated TOC please keep comment here to allow auto update -->

## Writing the REST API code

If we were actually building our own REST API server that fetches movie titles from a database, we'd start writing that code now and could do end-to-end testing against an actual Postgres database, populated with some test data.
But for this tutorial, we'll just copy in some already-written code:
<!-- doctest command -->
```
curl https://gitlab.com/adpt/tutorial-concepts/-/archive/v1/tutorial-concepts.tar.gz | tar -zxv --strip=1 -C ..
```

This command should have:
* Modified the Node.js code in `backend/index.js` to implement the search API
* Added the Postgres client library (pg) to `package.json`
* Added a file with some test data `deploy/test_db.sql` that will be pre-loaded into the Postgres database when we update the deployment.

## Update!
Now, update the deployment, which will push our newly written code and populate the database with the test data:
<!-- doctest command -->
```
adapt update myapp
```

When you perform an update, Adapt analyzes any changes you've made to your spec and compares that to the actual state of your infrastructure.
It then applies only those changes required to make your infrastructure match what you've defined in your spec.

## Test the API

Test your newly deployed API by using `curl` or your browser with these links:
-  [http://localhost:8080/search/batman](http://localhost:8080/search/batman)
-  [http://localhost:8080/search/lego](http://localhost:8080/search/lego)

<!-- doctest command -->
```
curl http://localhost:8080/search/lego
```

> **IMPORTANT**
>
> If you're using a browser, you may need to force it to hard refresh the page (reload while bypassing the browser cache).
> Instructions for most browsers can be found [here](https://en.wikipedia.org/wiki/Wikipedia:Bypass_your_cache#Bypassing_cache).

You should see a response like this:
```
[{"title":"The Lego Batman Movie","released":"Fri Feb 10 2017"}]
```

## Change and Repeat

If you'd like, you can now make any changes to the code in `backend` or to the test data in `deploy/test_db.sql`.
Each time you run the `adapt update` command from above, Adapt will re-build any necessary images and automatically re-deploy the changed images to your local Kubernetes cluster.
(Note: Don't forget to make your browser do a hard refresh.)

## Next Step

Next, we'll tear everything down and clean up.

| [<< Step 5: Connecting components to each other](./00_setup.md) | [Step 7: Destroying your deployment >> ](./07_destroying.md) |
| --- | --- |
