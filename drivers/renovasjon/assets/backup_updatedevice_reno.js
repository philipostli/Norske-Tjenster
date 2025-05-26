      // Finn den nærmeste neste tømmedatoen for alle avfallstyper
      /*const allDates = data.flatMap(curr => curr.Tommedatoer.map(dateString => new Date(dateString)));
      const nextDate = allDates.filter(date => date > new Date()).sort()[0];

      if (nextDate) {
        // Beregn antall dager til den neste tømmedatoen
        const diffTime = nextDate - new Date();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        const wasteType = wasteTypes[data[0].FraksjonId];
        const wasteTypePretty = wasteTypesPrettyShort[data[0].FraksjonId];

        setTimeout(() => {
          this.addRenoCap(`measure_next_waste_days_left`);
          setTimeout(() => {
            this.updateRenoCapOptions(`measure_next_waste_days_left`, { 'units': `dager - ${wasteTypePretty}` });
            this.updateRenoCap(`measure_next_waste_days_left`, diffDays);
          }, 500);
        }, 1000);
      } else {
        console.warn('Ingen tømmedatoer funnet.');
      }*/