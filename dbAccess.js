module.exports = (function(logger) {

    const fs = require("fs");
    const ibmdb = require('ibm_db');
    var databaseConnection;

    return {
    /**
     * Handles a synchronous connection of server to ibm database
     * Connection is opened via credentials found in DBcredentials.json
     */
    'connectToDB': function() {
    	logger.log('info', "Accessing the ibm database");

    	var credentialsUnparsed = fs.readFileSync("DBcredentials.json");
    	var credentialsParsed = JSON.parse(credentialsUnparsed);

        var connstring;
        if(process.env.BLUEMIX_REGION === undefined) {
          connstring = `DRIVER={DB2};DATABASE=${credentialsParsed.db};UID=${credentialsParsed.username};PWD=${credentialsParsed.password};HOSTNAME=${credentialsParsed.hostname};PORT=${credentialsParsed.port}`
        } else {
          //making sure there is a secure connection to the databse when running on remote server
          connstring = credentialsParsed.ssldsn;
    	}

    	try{
    		var option = { connectTimeout : 40, systemNaming : true };// Connection Timeout after 40 seconds.
    		databaseConnection = ibmdb.openSync(connstring,option);
    		logger.log('info', `Database connection is made`,databaseConnection);

    	}catch (e) {
    	    // 	On error in connection, log the error message on console
    		logger.log("error",e.message);
    	}
    },


    /**
     * Checks if the user with a specific name is already saved in the database
     * @param {String} userName
     */
    'doesUserExist': function(userName) {
    	return new Promise(function (resolve, reject) {
    		databaseConnection.query(`select userid from Users where USERID='${userName}'`, function(err,result, moreresults){
    			logger.log("info", "callback of search user");
    			if(err){
    				logger.log('error', err);
    				reject(err);
    			}else{
    				logger.log('info', `does user exist ${result[0]}`);
    				logger.log('info', `more results: ${moreresults}`);
    				resolve(result[0]);
    			}
    		});
    	}).catch((error) => {
        logger.log('error', error);
      });

    },
    /**
     * Handles adding users with name and password to the database, using a query request
     * @param {String} userName
     * @param {String} passwordHash
     */
    'addUserToDB': function(userName,passwordHash) {
    	return new Promise(function (resolve, reject) {
    		databaseConnection.query(`insert into Users values('${userName}','${passwordHash}');`,function(err,result){
    			logger.log("info", "callback of add user");
    			if(err){
    				logger.log('error', err);
    				reject(err);
    			}else{
    				logger.log('info', `adding user: ${userName}`);
    				resolve(result);
    			}
    		});
    	}).catch((error) => {
        logger.log('error', error);
      });
    },
    /**
     * Checks database for a specific user with corresponding password.
     * @param {*} userName
     * @param {*} passwordHash
     */
    'doUserCredentialsFit': function(userName,passwordHash) {
    	return new Promise(function (resolve, reject) {
    		databaseConnection.query(`select userid, password from Users where USERID='${userName}' and PASSWORD='${passwordHash}';`,function(err,result,moreresults){
    			logger.log("info", "callback of searching for a user with specific password");
    			if(err){
    				logger.log('error', err);
    				reject(err);
    			}else{
    				logger.log('info', `${userName} with corresponding password exists.`);
    				resolve(result[0]);
    			}
    		});
    	});
    }
  }
});
